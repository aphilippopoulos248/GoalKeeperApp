import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { SEED_ACTIVE_GOALS } from '../data/mockGoal';
import { regenerateDailyQuests } from '../services/openaiGoalPlanner';
import type { GoalPlannerFullResult } from '../services/openaiGoalPlanner';
import { Checkpoint, Goal, Quest } from '../types';

const GOALS_STORAGE_KEY = '@goalkeeper/active-goals-v1';

export type NewGoalInput = {
  title: string;
  description: string;
  targetDate: Date;
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
};

const ActiveGoalsContext = createContext<ActiveGoalsContextValue | null>(null);

function normalizeQuest(raw: unknown): Quest | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.title !== 'string') return null;
  if (typeof o.description !== 'string') return null;
  const points = o.points;
  const kind = o.kind;
  if (typeof points !== 'number' || !Number.isFinite(points)) return null;
  if (kind !== 'daily' && kind !== 'weekly') return null;
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    points,
    kind,
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

function enrichmentToDailyQuests(goalId: string, enrichment: GoalPlannerFullResult): Quest[] {
  return enrichment.dailyQuests.map((q, i) => ({
    id: `${goalId}-ai-dq-${i + 1}`,
    kind: 'daily' as const,
    title: q.title,
    description: q.description,
    points: q.points,
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
    completed: false,
    checkpoints: enrichmentToCheckpoints(id, enrichment),
    dailyQuests: enrichmentToDailyQuests(id, enrichment),
  };
}

export function ActiveGoalsProvider({ children }: { children: React.ReactNode }) {
  const [goals, setGoals] = useState<Goal[]>(() => [...SEED_ACTIVE_GOALS]);
  const [storageReady, setStorageReady] = useState(false);

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

  const toggleCheckpoint = useCallback((goalId: string, checkpointId: string) => {
    setGoals((prev) => {
      const oldGoal = prev.find((g) => g.id === goalId);
      if (!oldGoal) return prev;

      const cp = oldGoal.checkpoints.find((c) => c.id === checkpointId);
      if (!cp) return prev;

      const prevDoneCount = oldGoal.checkpoints.filter((c) => c.done).length;
      const nextCheckpoints = oldGoal.checkpoints.map((c) =>
        c.id === checkpointId ? { ...c, done: !c.done } : c,
      );
      const nextDoneCount = nextCheckpoints.filter((c) => c.done).length;

      const nextGoals = prev.map((g) =>
        g.id === goalId ? { ...g, checkpoints: nextCheckpoints } : g,
      );

      const markingComplete = !cp.done && nextDoneCount > prevDoneCount;

      if (markingComplete) {
        const updated = nextGoals.find((g) => g.id === goalId);
        if (updated?.targetDateIso) {
          const snapshot = { ...updated, checkpoints: nextCheckpoints };
          queueMicrotask(() => {
            void (async () => {
              try {
                const today = new Date();
                const dailyQuestsRaw = await regenerateDailyQuests({
                  title: snapshot.title,
                  description: snapshot.description,
                  targetDateIso: snapshot.targetDateIso!,
                  todayIso: today.toISOString(),
                  completedCheckpointCount: nextDoneCount,
                  checkpointTitles: snapshot.checkpoints.map((c) => c.title),
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
    () => ({ goals, addGoal, getGoalById, removeGoal, toggleCheckpoint }),
    [goals, addGoal, getGoalById, removeGoal, toggleCheckpoint],
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
