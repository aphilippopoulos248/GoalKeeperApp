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
import {
  deleteAllProgressJournalEntriesForUser,
  fetchProgressNarrative,
  fetchRecentProgressJournal,
  formatJournalRowsForAi,
  insertProgressJournalEntry,
  upsertProgressNarrative,
  type JournalEntrySource,
} from '../services/supabase/progressJournalRepository';
import { migrateLegacyLocalData } from '../services/supabase/legacyMigration';
import {
  generateMilestoneFromContext,
  GoalPlannerError,
  parseLifeBusySlotsFromMessage,
  regenerateDailyQuests,
  repositionDailyQuestsPreservingQuests,
  synthesizeProgressNarrative,
  USER_PROGRESS_JOURNAL_MAX_CHARS,
} from '../services/openaiGoalPlanner';
import type {
  GoalPlannerFullResult,
  PlannerDailyQuest,
  ReservedScheduleSlot,
} from '../services/openaiGoalPlanner';
import { Checkpoint, Goal, GoalPriority, GoalType, MilestoneFrequency, Quest } from '../types';
import { parseGoalType, parseMilestoneFrequency } from '../utils/goalNormalize';
import {
  clampScheduleDurationMinutes,
  clampScheduleStartMinute,
  mergeLifeSlotsWithOccupiedGoals,
} from '../utils/dailyQuestSchedule';
import { dailyQuestCountForPriority, parseGoalPriority } from '../utils/goalPriority';

import { clearAttachedExercisesForGoal } from '../lib/questAttachedExerciseStorage';
import { clearAttachedRecipesForGoal } from '../lib/questAttachedRecipeStorage';

import { useAuthUser } from './AuthUserContext';

export type NewGoalInput = {
  title: string;
  description: string;
  targetDate: Date;
  priority: GoalPriority;
  milestoneFrequency: MilestoneFrequency;
  goalType: GoalType;
};

export type AddGoalOptions = {
  enrichment?: GoalPlannerFullResult;
  achievabilityCritique?: string;
};

type ActiveGoalsContextValue = {
  goals: Goal[];
  /** True after the first load from Supabase (or signed-out demo state is ready). */
  goalsStorageReady: boolean;
  addGoal: (input: NewGoalInput, options?: AddGoalOptions) => Goal;
  getGoalById: (id: string) => Goal | undefined;
  removeGoal: (goalId: string) => void;
  toggleCheckpoint: (goalId: string, checkpointId: string) => void;
  /**
   * Generate AI milestone copy for an unlocked placeholder checkpoint. Requires sign-in and API key.
   */
  revealCheckpoint: (
    goalId: string,
    checkpointId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  updateDailyQuestSchedule: (
    goalId: string,
    questId: string,
    scheduleStartMinute: number,
    scheduleDurationMinutes: number,
  ) => void;
  lifeScheduleSlots: ReservedScheduleSlot[];
  applyLifeScheduleMessage: (message: string) => Promise<void>;
  clearLifeScheduleConstraints: () => Promise<void>;
  /** Regenerate every active goal’s daily quests (debug; new quest IDs, completions reset). */
  refreshAllDailyQuestsForDebug: () => Promise<void>;
  /**
   * Save a progress journal entry and refresh daily quest copy in place (keeps quest ids / completions).
   * Requires sign-in. Ignores goals that do not yet have a full daily set (backfill handles those).
   * On success, includes the counselor-synthesized narrative for debug display.
   */
  submitProgressJournal: (
    body: string,
    source: JournalEntrySource,
  ) => Promise<{ ok: true; narrative: string } | { ok: false; error: string }>;
  /** Delete stored progress journal entries and clear in-memory AI context (debug). Requires sign-in. */
  clearAiProgressMemory: () => Promise<{ ok: boolean; error?: string }>;
  /**
   * Debug: increment simulated day, extend narrative, full quest regen (new quest ids; checkmarks reset).
   * Requires sign-in and at least one active goal with storage ready.
   */
  advanceSimulationDay: () => Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * Debug: load planner journal context (in-memory), raw recent DB entries, and simulated day.
   * Requires sign-in.
   */
  fetchJournalDebugSnapshot: () => Promise<
    | {
        ok: true;
        plannerContext: string;
        rawJournalLines: string;
        entryCount: number;
        simulationDay: number;
      }
    | { ok: false; error: string }
  >;
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

function dayOrderValue(q: Quest): number {
  return typeof q.dayOrder === 'number' && Number.isFinite(q.dayOrder) ? q.dayOrder : 500;
}

function sortDailiesByDayOrder(dailies: Quest[]): Quest[] {
  return [...dailies].sort((a, b) => {
    const d = dayOrderValue(a) - dayOrderValue(b);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
}

/** Replaces title/body/schedule for existing daily quest ids; keeps ids stable. */
function applyPlannedDailiesPreservingIds(
  fullQuests: Quest[],
  sortedDailies: Quest[],
  planned: PlannerDailyQuest[],
): Quest[] {
  if (sortedDailies.length !== planned.length) return fullQuests;
  const byId = new Map<string, PlannerDailyQuest>();
  sortedDailies.forEach((q, i) => {
    byId.set(q.id, planned[i]!);
  });
  return fullQuests.map((q) => {
    const p = byId.get(q.id);
    if (!p || q.kind !== 'daily') return q;
    return {
      ...q,
      title: p.title,
      description: p.description,
      points: p.points,
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
    title: c.label.trim() || `Milestone ${i + 1}`,
    done: false,
    revealed: true,
    weekOffset: c.weekOffset,
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
      goalType: input.goalType,
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
    goalType: enrichment.goalType ?? input.goalType,
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
  const journalContextForAiRef = useRef<string>('');
  /** In-memory only: which "Day N" block journals merge into; advanced via debug button (not persisted). */
  const simulationDayForTestRef = useRef(1);
  const lastUserIdForSimDay = useRef<string | null>(null);

  useEffect(() => {
    goalsRef.current = goals;
  }, [goals]);

  useEffect(() => {
    if (userId !== lastUserIdForSimDay.current) {
      simulationDayForTestRef.current = 1;
      lastUserIdForSimDay.current = userId;
    }
  }, [userId]);

  useEffect(() => {
    lifeScheduleSlotsRef.current = lifeScheduleSlots;
  }, [lifeScheduleSlots]);

  useEffect(() => {
    if (!authReady) return;
    if (userId === null) {
      journalContextForAiRef.current = '';
      simulationDayForTestRef.current = 1;
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
      const [loadedGoals, slots, journalRows, existingNarrative] = await Promise.all([
        fetchGoalsForUser(userId),
        fetchLifeScheduleSlots(userId),
        fetchRecentProgressJournal(userId),
        fetchProgressNarrative(userId),
      ]);
      if (cancelled) return;
      let refText = (existingNarrative ?? '').trim();
      if (!refText && journalRows.length > 0) {
        try {
          const bundle = formatJournalRowsForAi(journalRows);
          const capped =
            bundle.length > USER_PROGRESS_JOURNAL_MAX_CHARS
              ? `${bundle.slice(0, USER_PROGRESS_JOURNAL_MAX_CHARS)}…`
              : bundle;
          const synthesized = await synthesizeProgressNarrative({
            previousNarrative: '',
            newEntry: capped,
            simulationDay: 1,
            mode: 'merge_journal',
          });
          const up = await upsertProgressNarrative(userId, synthesized);
          if (up.ok) {
            refText = synthesized.trim();
          } else {
            refText = bundle;
          }
        } catch (e) {
          console.error('[bootstrap progress narrative]', e);
          refText = formatJournalRowsForAi(journalRows);
        }
      }
      journalContextForAiRef.current = refText;
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
            upcomingCheckpointTitles: snapshot.checkpoints
              .filter((c) => !c.done)
              .map((c) => c.title),
            totalCheckpointCount: snapshot.checkpoints.length,
            dailyQuestCount: questCount,
            milestoneFrequency: parseMilestoneFrequency(snapshot.milestoneFrequency),
            goalType: parseGoalType(snapshot.goalType),
            reservedScheduleSlots: mergeLifeSlotsWithOccupiedGoals(
              lifeScheduleSlots,
              goals,
              snapshot.id,
            ),
            previousDailyQuests: (snapshot.dailyQuests ?? [])
              .filter((q) => q.kind === 'daily')
              .map((q) => ({ title: q.title, description: q.description })),
            userProgressJournal: journalContextForAiRef.current.trim() || undefined,
          });
          if (userId) {
            void clearAttachedRecipesForGoal(userId, snapshot.id);
            void clearAttachedExercisesForGoal(userId, snapshot.id);
          }
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
  }, [goals, storageReady, lifeScheduleSlots, userId]);

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
    const newGoal = buildGoalFromInput(input, options);
    setGoals((prev) => [newGoal, ...prev]);
    return newGoal;
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

  const refreshAllDailyQuestsForDebug = useCallback(async () => {
    if (!storageReady) return;
    const todayIso = new Date().toISOString();
    let working: Goal[] = goalsRef.current.map((g) => ({
      ...g,
      dailyQuests: g.dailyQuests?.map((q) => ({ ...q })),
    }));
    const errors: string[] = [];
    for (const goal of working) {
      if (goal.completed) continue;
      try {
        const questCount = dailyQuestCountForPriority(parseGoalPriority(goal.priority));
        const dailyQuestsRaw = await regenerateDailyQuests({
          title: goal.title,
          description: goal.description,
          targetDateIso: effectiveTargetDateIso(goal),
          todayIso,
          completedCheckpointCount: goal.checkpoints.filter((c) => c.done).length,
          checkpointTitles: goal.checkpoints.map((c) => c.title),
          upcomingCheckpointTitles: goal.checkpoints
            .filter((c) => !c.done)
            .map((c) => c.title),
          totalCheckpointCount: goal.checkpoints.length,
          dailyQuestCount: questCount,
          milestoneFrequency: parseMilestoneFrequency(goal.milestoneFrequency),
          goalType: parseGoalType(goal.goalType),
          reservedScheduleSlots: mergeLifeSlotsWithOccupiedGoals(
            lifeScheduleSlotsRef.current,
            working,
            goal.id,
          ),
          previousDailyQuests: (goal.dailyQuests ?? [])
            .filter((q) => q.kind === 'daily')
            .map((q) => ({ title: q.title, description: q.description })),
          userProgressJournal: journalContextForAiRef.current.trim() || undefined,
        });
        const regenBatch = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const newDailies: Quest[] = dailyQuestsRaw.map((q, i) => ({
          id: `${goal.id}-ai-dq-${regenBatch}-${i + 1}`,
          kind: 'daily' as const,
          title: q.title,
          description: q.description,
          points: q.points,
          dayOrder: q.dayOrder,
          scheduleStartMinute: q.startMinute,
          scheduleDurationMinutes: q.durationMinutes,
        }));
        if (userId) {
          void clearAttachedRecipesForGoal(userId, goal.id);
          void clearAttachedExercisesForGoal(userId, goal.id);
        }
        working = working.map((g) =>
          g.id === goal.id ? { ...g, dailyQuests: newDailies } : g,
        );
      } catch (e) {
        const label = goal.title.trim() || goal.id;
        const msg = e instanceof GoalPlannerError ? e.message : 'Request failed';
        errors.push(`${label}: ${msg}`);
        console.error('[refreshAllDailyQuestsForDebug]', goal.id, e);
      }
    }
    setGoals(working);
    if (errors.length > 0) {
      throw new Error(errors.join('\n'));
    }
  }, [storageReady, userId]);

  const refreshDailyQuestsWithJournalContext = useCallback(async () => {
    if (!storageReady) return;
    const todayIso = new Date().toISOString();
    const journal = journalContextForAiRef.current.trim() || undefined;
    let working: Goal[] = goalsRef.current.map((g) => ({
      ...g,
      dailyQuests: g.dailyQuests?.map((q) => ({ ...q })),
    }));
    for (const goal of working) {
      if (goal.completed) continue;
      const questCount = dailyQuestCountForPriority(parseGoalPriority(goal.priority));
      const dailies = (goal.dailyQuests ?? []).filter((q) => q.kind === 'daily');
      if (dailies.length < questCount) continue;
      const sortedDailies = sortDailiesByDayOrder(dailies);
      if (sortedDailies.length !== questCount) continue;
      try {
        const dailyQuestsRaw = await regenerateDailyQuests({
          title: goal.title,
          description: goal.description,
          targetDateIso: effectiveTargetDateIso(goal),
          todayIso,
          completedCheckpointCount: goal.checkpoints.filter((c) => c.done).length,
          checkpointTitles: goal.checkpoints.map((c) => c.title),
          upcomingCheckpointTitles: goal.checkpoints
            .filter((c) => !c.done)
            .map((c) => c.title),
          totalCheckpointCount: goal.checkpoints.length,
          dailyQuestCount: questCount,
          milestoneFrequency: parseMilestoneFrequency(goal.milestoneFrequency),
          goalType: parseGoalType(goal.goalType),
          reservedScheduleSlots: mergeLifeSlotsWithOccupiedGoals(
            lifeScheduleSlotsRef.current,
            working,
            goal.id,
          ),
          previousDailyQuests: sortedDailies.map((q) => ({
            title: q.title,
            description: q.description,
          })),
          userProgressJournal: journal,
        });
        if (dailyQuestsRaw.length !== questCount) continue;
        const newDailies = applyPlannedDailiesPreservingIds(
          goal.dailyQuests!,
          sortedDailies,
          dailyQuestsRaw,
        );
        if (userId) {
          void clearAttachedRecipesForGoal(userId, goal.id);
          void clearAttachedExercisesForGoal(userId, goal.id);
        }
        working = working.map((g) =>
          g.id === goal.id ? { ...g, dailyQuests: newDailies } : g,
        );
      } catch (e) {
        console.error('[refreshDailyQuestsWithJournalContext]', goal.id, e);
      }
    }
    setGoals(working);
    goalsRef.current = working;
  }, [storageReady, userId]);

  /** Refresh one goal’s dailies in place (stable quest ids), e.g. after a milestone is revealed. */
  const refreshDailyQuestsForGoalId = useCallback(
    async (goalId: string) => {
      if (!storageReady) return;
      const todayIso = new Date().toISOString();
      const journal = journalContextForAiRef.current.trim() || undefined;
      let working: Goal[] = goalsRef.current.map((g) => ({
        ...g,
        dailyQuests: g.dailyQuests?.map((q) => ({ ...q })),
      }));
      const goal = working.find((g) => g.id === goalId);
      if (!goal || goal.completed) return;
      const questCount = dailyQuestCountForPriority(parseGoalPriority(goal.priority));
      const dailies = (goal.dailyQuests ?? []).filter((q) => q.kind === 'daily');
      if (dailies.length < questCount) return;
      const sortedDailies = sortDailiesByDayOrder(dailies);
      if (sortedDailies.length !== questCount) return;
      try {
        const dailyQuestsRaw = await regenerateDailyQuests({
          title: goal.title,
          description: goal.description,
          targetDateIso: effectiveTargetDateIso(goal),
          todayIso,
          completedCheckpointCount: goal.checkpoints.filter((c) => c.done).length,
          checkpointTitles: goal.checkpoints.map((c) => c.title),
          upcomingCheckpointTitles: goal.checkpoints
            .filter((c) => !c.done)
            .map((c) => c.title),
          totalCheckpointCount: goal.checkpoints.length,
          dailyQuestCount: questCount,
          milestoneFrequency: parseMilestoneFrequency(goal.milestoneFrequency),
          goalType: parseGoalType(goal.goalType),
          reservedScheduleSlots: mergeLifeSlotsWithOccupiedGoals(
            lifeScheduleSlotsRef.current,
            working,
            goal.id,
          ),
          previousDailyQuests: sortedDailies.map((q) => ({
            title: q.title,
            description: q.description,
          })),
          userProgressJournal: journal,
        });
        if (dailyQuestsRaw.length !== questCount) return;
        const newDailies = applyPlannedDailiesPreservingIds(
          goal.dailyQuests!,
          sortedDailies,
          dailyQuestsRaw,
        );
        if (userId) {
          void clearAttachedRecipesForGoal(userId, goal.id);
          void clearAttachedExercisesForGoal(userId, goal.id);
        }
        working = working.map((g) =>
          g.id === goal.id ? { ...g, dailyQuests: newDailies } : g,
        );
        setGoals(working);
        goalsRef.current = working;
      } catch (e) {
        console.error('[refreshDailyQuestsForGoalId]', goal.id, e);
      }
    },
    [storageReady, userId],
  );

  const submitProgressJournal = useCallback(
    async (body: string, source: JournalEntrySource) => {
      const trimmed = body.trim();
      if (!trimmed) {
        return { ok: false, error: 'Entry is empty.' };
      }
      if (userId === null) {
        return { ok: false, error: 'Sign in to save progress notes for the AI.' };
      }
      const previousBody = (await fetchProgressNarrative(userId)) ?? '';
      const currentSimulationDay = simulationDayForTestRef.current;
      const row = await insertProgressJournalEntry({ userId, body: trimmed, source });
      if (!row) {
        return { ok: false, error: 'Could not save your entry.' };
      }
      let synthesized: string;
      try {
        synthesized = await synthesizeProgressNarrative({
          previousNarrative: previousBody,
          newEntry: trimmed,
          simulationDay: currentSimulationDay,
          mode: 'merge_journal',
        });
      } catch (e) {
        const message =
          e instanceof GoalPlannerError
            ? e.message
            : e instanceof Error && e.message.trim()
              ? e.message
              : 'Could not update progress story.';
        return { ok: false, error: message };
      }
      const up = await upsertProgressNarrative(userId, synthesized);
      if (!up.ok) {
        return { ok: false, error: up.error };
      }
      const narrative = synthesized.trim();
      journalContextForAiRef.current = narrative;
      await refreshDailyQuestsWithJournalContext();
      return { ok: true, narrative };
    },
    [userId, refreshDailyQuestsWithJournalContext],
  );

  const clearAiProgressMemory = useCallback(async () => {
    if (userId === null) {
      return { ok: false as const, error: 'Sign in to clear the AI progress journal.' };
    }
    const res = await deleteAllProgressJournalEntriesForUser(userId);
    if (!res.ok) {
      return { ok: false as const, error: res.error };
    }
    journalContextForAiRef.current = '';
    simulationDayForTestRef.current = 1;
    return { ok: true as const };
  }, [userId]);

  const advanceSimulationDay = useCallback(async () => {
    if (userId === null) {
      return { ok: false, error: 'Sign in to advance the simulated day.' };
    }
    if (!storageReady) {
      return { ok: false, error: 'Goals are not ready yet.' };
    }
    if (goalsRef.current.filter((g) => !g.completed).length === 0) {
      return { ok: false, error: 'Add an active goal first.' };
    }
    const previousBody = (await fetchProgressNarrative(userId)) ?? '';
    const nextDay = simulationDayForTestRef.current + 1;
    let synthesized: string;
    try {
      synthesized = await synthesizeProgressNarrative({
        previousNarrative: previousBody,
        newEntry: '',
        simulationDay: nextDay,
        mode: 'advance_day',
      });
    } catch (e) {
      const message =
        e instanceof GoalPlannerError
          ? e.message
          : e instanceof Error && e.message.trim()
            ? e.message
            : 'Could not update progress story for the new day.';
      return { ok: false, error: message };
    }
    const up = await upsertProgressNarrative(userId, synthesized);
    if (!up.ok) {
      return { ok: false, error: up.error };
    }
    simulationDayForTestRef.current = nextDay;
    journalContextForAiRef.current = synthesized.trim();
    try {
      await refreshAllDailyQuestsForDebug();
    } catch (e) {
      const message =
        e instanceof Error && e.message.trim() ? e.message : 'Quest refresh failed.';
      return { ok: false, error: message };
    }
    return { ok: true };
  }, [userId, storageReady, refreshAllDailyQuestsForDebug]);

  const fetchJournalDebugSnapshot = useCallback(async () => {
    if (userId === null) {
      return { ok: false as const, error: 'Sign in to view journal debug info.' };
    }
    const plannerContext = journalContextForAiRef.current.trim();
    const rows = await fetchRecentProgressJournal(userId);
    const rawJournalLines =
      rows.length === 0
        ? '(no saved journal rows in the last 14 days)'
        : [...rows]
            .sort(
              (a, b) =>
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            )
            .map((r) => `[${r.entry_date} ${r.source}] ${r.body}`)
            .join('\n\n');
    return {
      ok: true as const,
      plannerContext,
      rawJournalLines,
      entryCount: rows.length,
      simulationDay: simulationDayForTestRef.current,
    };
  }, [userId]);

  const revealCheckpoint = useCallback(
    async (goalId: string, checkpointId: string) => {
      if (userId === null) {
        return { ok: false as const, error: 'Sign in to unlock milestones with AI.' };
      }
      const snapshot = goalsRef.current.find((g) => g.id === goalId);
      if (!snapshot) {
        return { ok: false as const, error: 'Goal not found.' };
      }
      const cpIndex = snapshot.checkpoints.findIndex((c) => c.id === checkpointId);
      if (cpIndex === -1) {
        return { ok: false as const, error: 'Milestone not found.' };
      }
      const cp = snapshot.checkpoints[cpIndex];
      if (cp.revealed !== false) {
        return { ok: false as const, error: 'This milestone is already revealed.' };
      }
      const weekOffset =
        typeof cp.weekOffset === 'number' && Number.isFinite(cp.weekOffset)
          ? cp.weekOffset
          : cpIndex + 1;
      const revealedPriorTitles = snapshot.checkpoints
        .slice(0, cpIndex)
        .filter((c) => c.revealed !== false)
        .map((c) => c.title);
      let title: string;
      try {
        title = await generateMilestoneFromContext({
          title: snapshot.title,
          description: snapshot.description,
          specific: snapshot.specific,
          measurable: snapshot.measurable,
          achievable: snapshot.achievable,
          relevant: snapshot.relevant,
          timeBound: snapshot.timeBound,
          goalType: parseGoalType(snapshot.goalType),
          milestoneFrequency: parseMilestoneFrequency(snapshot.milestoneFrequency),
          milestoneIndex: cpIndex + 1,
          totalMilestones: snapshot.checkpoints.length,
          weekOffset,
          completedCheckpointCount: snapshot.checkpoints.filter((c) => c.done).length,
          revealedPriorTitles,
          userProgressNarrative: journalContextForAiRef.current.trim() || undefined,
          targetDateIso: effectiveTargetDateIso(snapshot),
          todayIso: new Date().toISOString(),
        });
      } catch (e) {
        const message =
          e instanceof GoalPlannerError
            ? e.message
            : e instanceof Error && e.message.trim()
              ? e.message
              : 'Could not generate milestone.';
        return { ok: false as const, error: message };
      }
      const prev = goalsRef.current;
      const next = prev.map((g) => {
        if (g.id !== goalId) return g;
        return {
          ...g,
          checkpoints: g.checkpoints.map((c) =>
            c.id === checkpointId ? { ...c, title, revealed: true } : c,
          ),
        };
      });
      setGoals(next);
      goalsRef.current = next;
      await refreshDailyQuestsForGoalId(goalId);
      return { ok: true as const };
    },
    [userId, refreshDailyQuestsForGoalId],
  );

  const toggleCheckpoint = useCallback((goalId: string, checkpointId: string) => {
    setGoals((prev) => {
      const oldGoal = prev.find((g) => g.id === goalId);
      if (!oldGoal) return prev;

      const idx = oldGoal.checkpoints.findIndex((c) => c.id === checkpointId);
      if (idx === -1) return prev;

      const cp = oldGoal.checkpoints[idx];
      if (cp.revealed === false) return prev;
      if (cp.done) return prev;

      const nextCheckpoints = oldGoal.checkpoints.map((c, i) =>
        i <= idx ? { ...c, done: true } : c,
      );

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
      revealCheckpoint,
      updateDailyQuestSchedule,
      lifeScheduleSlots,
      applyLifeScheduleMessage,
      clearLifeScheduleConstraints,
      refreshAllDailyQuestsForDebug,
      submitProgressJournal,
      clearAiProgressMemory,
      advanceSimulationDay,
      fetchJournalDebugSnapshot,
    }),
    [
      goals,
      storageReady,
      addGoal,
      getGoalById,
      removeGoal,
      toggleCheckpoint,
      revealCheckpoint,
      updateDailyQuestSchedule,
      lifeScheduleSlots,
      applyLifeScheduleMessage,
      clearLifeScheduleConstraints,
      refreshAllDailyQuestsForDebug,
      submitProgressJournal,
      clearAiProgressMemory,
      advanceSimulationDay,
      fetchJournalDebugSnapshot,
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
