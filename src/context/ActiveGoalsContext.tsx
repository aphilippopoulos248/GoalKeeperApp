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
import { fetchGoalsForUser, syncGoalsForUser } from '../services/supabase/goalsRepository';
import { fetchLifeScheduleSlots, replaceLifeScheduleSlots } from '../services/supabase/lifeScheduleRepository';
import { migrateLegacyLocalData } from '../services/supabase/legacyMigration';
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
import { Goal, GoalPriority, MilestoneFrequency, Quest } from '../types';
import { parseMilestoneFrequency } from '../utils/goalNormalize';
import {
  clampScheduleDurationMinutes,
  clampScheduleStartMinute,
  mergeLifeSlotsWithOccupiedGoals,
} from '../utils/dailyQuestSchedule';
import { dailyQuestCountForPriority, parseGoalPriority } from '../utils/goalPriority';

import { useAuthUser } from './AuthUserContext';

export type NewGoalInput = {
  title: string;
  description: string;
  targetDate: Date;
  priority: GoalPriority;
  milestoneFrequency: MilestoneFrequency;
};

export type AddGoalOptions = {
  enrichment?: GoalPlannerFullResult;
  achievabilityCritique?: string;
};

type ActiveGoalsContextValue = {
  goals: Goal[];
  /** True after the first load from Supabase (or signed-out demo state is ready). */
  goalsStorageReady: boolean;
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

/** Used for AI calls when the goal has no stored deadline. */
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

function buildGoalFromInput(input: NewGoalInput, options?: AddGoalOptions): Goal {
  const id = `g-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const targetDateIso = input.targetDate.toISOString();
  const dateLabel = input.targetDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const enrichment = options?.enrichment;
  const critiqueOpt = options?.achievabilityCritique?.trim() || undefined;
  const critiqueSpread = critiqueOpt ? { achievabilityCritique: critiqueOpt } : {};

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
      ...critiqueSpread,
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
    ...critiqueSpread,
    completed: false,
    checkpoints: enrichmentToCheckpoints(id, enrichment),
    dailyQuests: enrichmentToDailyQuests(id, enrichment),
  };
}

export function ActiveGoalsProvider({ children }: { children: React.ReactNode }) {
  const { userId, authReady } = useAuthUser();
  const [goals, setGoals] = useState<Goal[]>(() => []);
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
    if (!authReady) return;
    if (userId === null) {
      setGoals([...SEED_ACTIVE_GOALS]);
      setLifeScheduleSlots([]);
      lifeScheduleSlotsRef.current = [];
      lifeSlotsHydrated.current = true;
      setStorageReady(true);
      return;
    }
    lifeSlotsHydrated.current = false;
    let cancelled = false;
    setStorageReady(false);
    void (async () => {
      await migrateLegacyLocalData(userId);
      if (cancelled) return;
      const [loadedGoals, slots] = await Promise.all([
        fetchGoalsForUser(userId),
        fetchLifeScheduleSlots(userId),
      ]);
      if (cancelled) return;
      setGoals(loadedGoals);
      setLifeScheduleSlots(slots);
      lifeScheduleSlotsRef.current = slots;
      lifeSlotsHydrated.current = true;
      setStorageReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, authReady]);

  useEffect(() => {
    if (!authReady || userId === null || !lifeSlotsHydrated.current) return;
    const t = setTimeout(() => {
      void replaceLifeScheduleSlots(userId, lifeScheduleSlots);
    }, 400);
    return () => clearTimeout(t);
  }, [lifeScheduleSlots, authReady, userId]);

  useEffect(() => {
    if (!authReady || userId === null || !storageReady) return;
    const t = setTimeout(() => {
      void syncGoalsForUser(userId, goals);
    }, 400);
    return () => clearTimeout(t);
  }, [goals, storageReady, authReady, userId]);

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
    setGoals((prev) => [buildGoalFromInput(input, options), ...prev]);
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

      const nextGoals = prev.map((g) =>
        g.id === goalId ? { ...g, checkpoints: nextCheckpoints } : g,
      );

      // Intentionally no regenerateDailyQuests here on checkpoint complete: replacing daily
      // quest ids would orphan quest_completions rows and clear "done" state in the UI.

      return nextGoals;
    });
  }, []);

  const value = useMemo(
    () => ({
      goals,
      goalsStorageReady: storageReady,
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
      storageReady,
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
