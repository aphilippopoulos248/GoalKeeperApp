import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { SEED_ACTIVE_GOALS } from '../data/mockGoal';
import { loadLifeScheduleSlots, saveLifeScheduleSlots } from '../services/lifeScheduleSlots';
import {
  parseLifeBusySlotsFromMessage,
  regenerateDailyQuests,
  repositionDailyQuestsPreservingQuests,
} from '../services/openaiGoalPlanner';
import type {
  GoalPlannerFullResult,
  PlannerDailyQuest,
  ReservedScheduleSlot,
} from '../services/openaiGoalPlanner';
import {
  Checkpoint,
  Goal,
  GoalPriority,
  MilestoneFrequency,
  Quest,
} from '../types';
import {
  clampScheduleDurationMinutes,
  clampScheduleStartMinute,
  mergeLifeSlotsWithOccupiedGoals,
} from '../utils/dailyQuestSchedule';
import { dailyQuestCountForPriority, parseGoalPriority } from '../utils/goalPriority';

const GOALS_STORAGE_KEY = '@goalkeeper/active-goals-v1';

export type NewGoalInput = {
  title: string;
  description: string;
  targetDate: Date;
  priority: GoalPriority;
  milestoneFrequency: MilestoneFrequency;
};

export type AddGoalOptions = {
  enrichment?: GoalPlannerFullResult;
};

type ActiveGoalsContextValue = {
  goals: Goal[];
  addGoal: (input: NewGoalInput, options?: AddGoalOptions) => void;
  getGoalById: (id: string) => Goal | undefined;
  removeGoal: (goalId: string) => void;
  toggleCheckpoint: (goalId: string, checkpointId: string) => void;
  updateDailyQuestSchedule: (
    goalId: string,
    questId: string,
    scheduleStartMinute: number,
    scheduleDurationMinutes: number,
  ) => void;
  lifeScheduleSlots: ReservedScheduleSlot[];
  applyLifeScheduleMessage: (message: string) => Promise<void>;
  clearLifeScheduleConstraints: () => Promise<void>;
};

const ActiveGoalsContext = createContext<ActiveGoalsContextValue | null>(null);

function parseMilestoneFrequency(raw: unknown): MilestoneFrequency {
  if (raw === 'weekly' || raw === 'biweekly' || raw === 'monthly') {
    return raw;
  }
  return 'weekly';
}

function normalizeQuest(raw: unknown): Quest | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.title !== 'string') return null;
  if (typeof o.description !== 'string') return null;
  const points = o.points;
  const kind = o.kind;
  if (typeof points !== 'number' || !Number.isFinite(points)) return null;
  if (kind !== 'daily' && kind !== 'weekly') return null;
  const dayOrderRaw = o.dayOrder;
  const dayOrder =
    typeof dayOrderRaw === 'number' && Number.isFinite(dayOrderRaw)
      ? Math.min(999, Math.max(0, Math.round(dayOrderRaw)))
      : undefined;
  const scheduleStartRaw = o.scheduleStartMinute;
  const scheduleStartMinute =
    typeof scheduleStartRaw === 'number' && Number.isFinite(scheduleStartRaw)
      ? Math.min(1439, Math.max(0, Math.round(scheduleStartRaw)))
      : undefined;
  const scheduleDurRaw = o.scheduleDurationMinutes;
  const scheduleDurationMinutes =
    typeof scheduleDurRaw === 'number' && Number.isFinite(scheduleDurRaw)
      ? Math.min(120, Math.max(15, Math.round(scheduleDurRaw)))
      : undefined;
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    points,
    kind,
    ...(dayOrder !== undefined ? { dayOrder } : {}),
    ...(scheduleStartMinute !== undefined ? { scheduleStartMinute } : {}),
    ...(scheduleDurationMinutes !== undefined ? { scheduleDurationMinutes } : {}),
  };
}

function normalizeCheckpoint(raw: unknown): Checkpoint | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.title !== 'string') return null;
  return {
    id: o.id,
    title: o.title,
    done: typeof o.done === 'boolean' ? o.done : false,
  };
}

function normalizeGoal(raw: unknown): Goal | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.id !== 'string' ||
    typeof o.title !== 'string' ||
    typeof o.description !== 'string' ||
    typeof o.specific !== 'string' ||
    typeof o.measurable !== 'string' ||
    typeof o.achievable !== 'string' ||
    typeof o.relevant !== 'string' ||
    typeof o.timeBound !== 'string'
  ) {
    return null;
  }
  if (!Array.isArray(o.checkpoints)) return null;
  const checkpoints = o.checkpoints
    .map(normalizeCheckpoint)
    .filter((c): c is Checkpoint => c !== null);

  let dailyQuests: Quest[] | undefined;
  if (Array.isArray(o.dailyQuests)) {
    const dq = o.dailyQuests.map(normalizeQuest).filter((q): q is Quest => q !== null);
    if (dq.length > 0) dailyQuests = dq;
  }

  return {
    id: o.id,
    title: o.title,
    description: o.description,
    specific: o.specific,
    measurable: o.measurable,
    achievable: o.achievable,
    relevant: o.relevant,
    timeBound: o.timeBound,
    targetDateIso: typeof o.targetDateIso === 'string' ? o.targetDateIso : undefined,
    priority: parseGoalPriority(o.priority),
    milestoneFrequency: parseMilestoneFrequency(o.milestoneFrequency),
    checkpoints,
    dailyQuests,
    completed: typeof o.completed === 'boolean' ? o.completed : false,
  };
}

async function loadGoalsFromStorage(): Promise<Goal[] | null> {
  try {
    const raw = await AsyncStorage.getItem(GOALS_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const goals = parsed.map(normalizeGoal).filter((g): g is Goal => g !== null);
    return goals;
  } catch {
    return null;
  }
}

async function saveGoalsToStorage(goals: Goal[]): Promise<void> {
  await AsyncStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(goals));
}

function mergeDailyQuestSchedule(
  fullQuests: Quest[],
  dailiesInOrder: Quest[],
  planned: PlannerDailyQuest[],
): Quest[] {
  if (dailiesInOrder.length !== planned.length) return fullQuests;
  const byId = new Map<string, PlannerDailyQuest>();
  dailiesInOrder.forEach((q, i) => {
    byId.set(q.id, planned[i]);
  });
  return fullQuests.map((q) => {
    const p = byId.get(q.id);
    if (!p || q.kind !== 'daily') return q;
    return {
      ...q,
      dayOrder: p.dayOrder,
      scheduleStartMinute: p.startMinute,
      scheduleDurationMinutes: p.durationMinutes,
    };
  });
}

/** Used for AI calls when the goal has no stored deadline (e.g. seed data). */
function effectiveTargetDateIso(goal: Pick<Goal, 'targetDateIso'>): string {
  if (goal.targetDateIso?.trim()) return goal.targetDateIso;
  const d = new Date();
  d.setDate(d.getDate() + 90);
  return d.toISOString();
}

function enrichmentToDailyQuests(goalId: string, enrichment: GoalPlannerFullResult): Quest[] {
  return enrichment.dailyQuests.map((q, i) => ({
    id: `${goalId}-ai-dq-${i + 1}`,
    kind: 'daily' as const,
    title: q.title,
    description: q.description,
    points: q.points,
    dayOrder: q.dayOrder,
    scheduleStartMinute: q.startMinute,
    scheduleDurationMinutes: q.durationMinutes,
  }));
}

function enrichmentToCheckpoints(goalId: string, enrichment: GoalPlannerFullResult): Checkpoint[] {
  return enrichment.checkpoints.map((c, i) => ({
    id: `${goalId}-cp-${i + 1}`,
    title: `Week ${c.weekOffset}: ${c.label}`,
    done: false,
  }));
}

function buildGoalFromInput(input: NewGoalInput, enrichment?: GoalPlannerFullResult): Goal {
  const id = `g-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const targetDateIso = input.targetDate.toISOString();
  const dateLabel = input.targetDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  if (!enrichment) {
    return {
      id,
      title: input.title.trim(),
      description: input.description.trim(),
      specific: input.description.trim(),
      measurable:
        'Define concrete metrics as you break this goal into smaller steps.',
      achievable: 'Adjust scope if life gets busy—progress beats perfection.',
      relevant: 'Tied to what matters to you right now.',
      timeBound: `Achieve by ${dateLabel}.`,
      targetDateIso,
      priority: input.priority,
      milestoneFrequency: input.milestoneFrequency,
      completed: false,
      checkpoints: [
        {
          id: `${id}-cp1`,
          title: 'Define your first milestone',
          done: false,
        },
      ],
    };
  }

  return {
    id,
    title: input.title.trim(),
    description: input.description.trim(),
    specific: enrichment.specific,
    measurable: enrichment.measurable,
    achievable: enrichment.achievable,
    relevant: enrichment.relevant,
    timeBound: enrichment.timeBound,
    targetDateIso,
    priority: input.priority,
    milestoneFrequency: input.milestoneFrequency,
    completed: false,
    checkpoints: enrichmentToCheckpoints(id, enrichment),
    dailyQuests: enrichmentToDailyQuests(id, enrichment),
  };
}

export function ActiveGoalsProvider({ children }: { children: React.ReactNode }) {
  const [goals, setGoals] = useState<Goal[]>(() => [...SEED_ACTIVE_GOALS]);
  const [storageReady, setStorageReady] = useState(false);
  const [lifeScheduleSlots, setLifeScheduleSlots] = useState<ReservedScheduleSlot[]>([]);
  const lifeSlotsHydrated = useRef(false);
  const goalsRef = useRef<Goal[]>(goals);
  const lifeScheduleSlotsRef = useRef<ReservedScheduleSlot[]>([]);
  const dailyQuestBackfillInFlight = useRef(new Set<string>());

  useEffect(() => {
    goalsRef.current = goals;
  }, [goals]);

  useEffect(() => {
    lifeScheduleSlotsRef.current = lifeScheduleSlots;
  }, [lifeScheduleSlots]);

  useEffect(() => {
    let cancelled = false;
    void loadLifeScheduleSlots().then((slots) => {
      if (cancelled) return;
      setLifeScheduleSlots(slots);
      lifeScheduleSlotsRef.current = slots;
      lifeSlotsHydrated.current = true;
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!lifeSlotsHydrated.current) return;
    void saveLifeScheduleSlots(lifeScheduleSlots);
  }, [lifeScheduleSlots]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadGoalsFromStorage();
      if (cancelled) return;
      if (loaded !== null) {
        setGoals(loaded);
      }
      setStorageReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    void saveGoalsToStorage(goals);
  }, [goals, storageReady]);

  useEffect(() => {
    if (!storageReady) return;
    for (const g of goals) {
      if (g.completed) continue;
      const expectedCount = dailyQuestCountForPriority(parseGoalPriority(g.priority));
      if (g.dailyQuests != null && g.dailyQuests.length >= expectedCount) continue;
      if (dailyQuestBackfillInFlight.current.has(g.id)) continue;
      dailyQuestBackfillInFlight.current.add(g.id);
      const snapshot = g;
      void (async () => {
        try {
          const today = new Date();
          const completedCheckpointCount = snapshot.checkpoints.filter((c) => c.done).length;
          const questCount = dailyQuestCountForPriority(
            parseGoalPriority(snapshot.priority),
          );
          const dailyQuestsRaw = await regenerateDailyQuests({
            title: snapshot.title,
            description: snapshot.description,
            targetDateIso: effectiveTargetDateIso(snapshot),
            todayIso: today.toISOString(),
            completedCheckpointCount,
            checkpointTitles: snapshot.checkpoints.map((c) => c.title),
            dailyQuestCount: questCount,
            milestoneFrequency: parseMilestoneFrequency(snapshot.milestoneFrequency),
            reservedScheduleSlots: mergeLifeSlotsWithOccupiedGoals(
              lifeScheduleSlots,
              goals,
              snapshot.id,
            ),
          });
          const regenBatch = Date.now();
          setGoals((cur) =>
            cur.map((goal) => {
              if (goal.id !== snapshot.id) return goal;
              const need = dailyQuestCountForPriority(parseGoalPriority(goal.priority));
              if (goal.dailyQuests != null && goal.dailyQuests.length >= need) {
                return goal;
              }
              return {
                ...goal,
                dailyQuests: dailyQuestsRaw.map((q, i) => ({
                  id: `${goal.id}-ai-dq-${regenBatch}-${i + 1}`,
                  kind: 'daily' as const,
                  title: q.title,
                  description: q.description,
                  points: q.points,
                  dayOrder: q.dayOrder,
                  scheduleStartMinute: q.startMinute,
                  scheduleDurationMinutes: q.durationMinutes,
                })),
              };
            }),
          );
        } catch {
          // Non-blocking: same as checkpoint regen
        } finally {
          dailyQuestBackfillInFlight.current.delete(snapshot.id);
        }
      })();
    }
  }, [goals, storageReady, lifeScheduleSlots]);

  const reflowDailyQuestsWithLifeSlots = useCallback(
    async (lifeSlots: ReservedScheduleSlot[]) => {
      const today = new Date();
      let working: Goal[] = goalsRef.current.map((g) => ({
        ...g,
        dailyQuests: g.dailyQuests?.map((q) => ({ ...q })),
      }));
      const ordered = working.filter(
        (g) =>
          !g.completed &&
          (g.dailyQuests?.filter((q) => q.kind === 'daily').length ?? 0) > 0,
      );
      for (const g of ordered) {
        const dq = g.dailyQuests!.filter((q) => q.kind === 'daily');
        const reserved = mergeLifeSlotsWithOccupiedGoals(lifeSlots, working, g.id);
        try {
          const planned = await repositionDailyQuestsPreservingQuests({
            goalTitle: g.title,
            goalDescription: g.description,
            completedCheckpointCount: g.checkpoints.filter((c) => c.done).length,
            milestoneFrequency: parseMilestoneFrequency(g.milestoneFrequency),
            checkpointTitles: g.checkpoints.map((c) => c.title),
            quests: dq,
            reservedScheduleSlots: reserved,
            todayIso: today.toISOString(),
            targetDateIso: effectiveTargetDateIso(g),
          });
          working = working.map((goal) => {
            if (goal.id !== g.id) return goal;
            return {
              ...goal,
              dailyQuests: mergeDailyQuestSchedule(goal.dailyQuests!, dq, planned),
            };
          });
        } catch {
          /* leave goal unchanged */
        }
      }
      setGoals(working);
      goalsRef.current = working;
    },
    [],
  );

  const addGoal = useCallback((input: NewGoalInput, options?: AddGoalOptions) => {
    setGoals((prev) => [buildGoalFromInput(input, options?.enrichment), ...prev]);
  }, []);

  const getGoalById = useCallback(
    (id: string) => goals.find((g) => g.id === id),
    [goals],
  );

  const removeGoal = useCallback((goalId: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== goalId));
  }, []);

  const updateDailyQuestSchedule = useCallback(
    (
      goalId: string,
      questId: string,
      scheduleStartMinute: number,
      scheduleDurationMinutes: number,
    ) => {
      const d = clampScheduleDurationMinutes(scheduleDurationMinutes);
      const s = clampScheduleStartMinute(scheduleStartMinute, d);
      setGoals((prev) =>
        prev.map((g) => {
          if (g.id !== goalId) return g;
          const dailies = g.dailyQuests;
          if (!dailies?.length) return g;
          let changed = false;
          const nextDailies = dailies.map((q) => {
            if (q.id !== questId || q.kind !== 'daily') return q;
            changed = true;
            return {
              ...q,
              scheduleStartMinute: s,
              scheduleDurationMinutes: d,
            };
          });
          return changed ? { ...g, dailyQuests: nextDailies } : g;
        }),
      );
    },
    [],
  );

  const applyLifeScheduleMessage = useCallback(
    async (message: string) => {
      const trimmed = message.trim();
      if (!trimmed) return;
      const today = new Date();
      const nextSlots = await parseLifeBusySlotsFromMessage({
        message: trimmed,
        priorBusyIntervals: lifeScheduleSlotsRef.current,
        todayIso: today.toISOString(),
      });
      setLifeScheduleSlots(nextSlots);
      lifeScheduleSlotsRef.current = nextSlots;
      await reflowDailyQuestsWithLifeSlots(nextSlots);
    },
    [reflowDailyQuestsWithLifeSlots],
  );

  const clearLifeScheduleConstraints = useCallback(async () => {
    setLifeScheduleSlots([]);
    lifeScheduleSlotsRef.current = [];
    await reflowDailyQuestsWithLifeSlots([]);
  }, [reflowDailyQuestsWithLifeSlots]);

  const toggleCheckpoint = useCallback((goalId: string, checkpointId: string) => {
    setGoals((prev) => {
      const oldGoal = prev.find((g) => g.id === goalId);
      if (!oldGoal) return prev;

      const idx = oldGoal.checkpoints.findIndex((c) => c.id === checkpointId);
      if (idx === -1) return prev;

      const cp = oldGoal.checkpoints[idx];
      const willComplete = !cp.done;

      const nextCheckpoints = oldGoal.checkpoints.map((c, i) => {
        if (willComplete) {
          return i <= idx ? { ...c, done: true } : c;
        }
        return i >= idx ? { ...c, done: false } : c;
      });

      const prevDoneCount = oldGoal.checkpoints.filter((c) => c.done).length;
      const nextDoneCount = nextCheckpoints.filter((c) => c.done).length;

      const nextGoals = prev.map((g) =>
        g.id === goalId ? { ...g, checkpoints: nextCheckpoints } : g,
      );

      const markingComplete = !cp.done && nextDoneCount > prevDoneCount;

      if (markingComplete) {
        const updated = nextGoals.find((g) => g.id === goalId);
        if (updated) {
          const snapshot = { ...updated, checkpoints: nextCheckpoints };
          queueMicrotask(() => {
            void (async () => {
              try {
                const today = new Date();
                const questCount = dailyQuestCountForPriority(
                  parseGoalPriority(snapshot.priority),
                );
                const dailyQuestsRaw = await regenerateDailyQuests({
                  title: snapshot.title,
                  description: snapshot.description,
                  targetDateIso: effectiveTargetDateIso(snapshot),
                  todayIso: today.toISOString(),
                  completedCheckpointCount: nextDoneCount,
                  checkpointTitles: snapshot.checkpoints.map((c) => c.title),
                  dailyQuestCount: questCount,
                  milestoneFrequency: parseMilestoneFrequency(snapshot.milestoneFrequency),
                  reservedScheduleSlots: mergeLifeSlotsWithOccupiedGoals(
                    lifeScheduleSlotsRef.current,
                    prev,
                    goalId,
                  ),
                });
                const regenBatch = Date.now();
                setGoals((cur) =>
                  cur.map((g) => {
                    if (g.id !== goalId) return g;
                    return {
                      ...g,
                      dailyQuests: dailyQuestsRaw.map((q, i) => ({
                        id: `${g.id}-ai-dq-${regenBatch}-${i + 1}`,
                        kind: 'daily' as const,
                        title: q.title,
                        description: q.description,
                        points: q.points,
                        dayOrder: q.dayOrder,
                        scheduleStartMinute: q.startMinute,
                        scheduleDurationMinutes: q.durationMinutes,
                      })),
                    };
                  }),
                );
              } catch {
                // Non-blocking: keep existing quests on API failure
              }
            })();
          });
        }
      }

      return nextGoals;
    });
  }, []);

  const value = useMemo(
    () => ({
      goals,
      addGoal,
      getGoalById,
      removeGoal,
      toggleCheckpoint,
      updateDailyQuestSchedule,
      lifeScheduleSlots,
      applyLifeScheduleMessage,
      clearLifeScheduleConstraints,
    }),
    [
      goals,
      addGoal,
      getGoalById,
      removeGoal,
      toggleCheckpoint,
      updateDailyQuestSchedule,
      lifeScheduleSlots,
      applyLifeScheduleMessage,
      clearLifeScheduleConstraints,
    ],
  );

  return (
    <ActiveGoalsContext.Provider value={value}>
      {children}
    </ActiveGoalsContext.Provider>
  );
}

export function useActiveGoals() {
  const ctx = useContext(ActiveGoalsContext);
  if (!ctx) {
    throw new Error('useActiveGoals must be used within ActiveGoalsProvider');
  }
  return ctx;
}
