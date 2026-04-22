import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useDailyStreakAndPointsToday } from '../hooks/useDailyStreakAndPointsToday';
import {
  fetchGoalBarEarnedMap,
  fetchQuestCompletionsMap,
  upsertGoalBarEarned,
  upsertQuestCompletion,
} from '../services/supabase/questProgressRepository';
import { fetchWeeklyQuestsForUser } from '../services/supabase/weeklyQuestsRepository';
import type { Quest } from '../types';
import { resolveQuestScheduleBlock } from '../utils/dailyQuestSchedule';

import { useActiveGoals } from './ActiveGoalsContext';
import { useAuthUser } from './AuthUserContext';

const MINUTES_PER_DAY = 24 * 60;

/** Same ordering as the day schedule (start, end, then stable ids). */
function compareDailyEntriesByScheduleTime(a: DailyQuestEntry, b: DailyQuestEntry): number {
  const ra = resolveQuestScheduleBlock(a.quest, 0, 1);
  const rb = resolveQuestScheduleBlock(b.quest, 0, 1);
  const endA = Math.min(MINUTES_PER_DAY, ra.startMinute + ra.durationMinutes);
  const endB = Math.min(MINUTES_PER_DAY, rb.startMinute + rb.durationMinutes);
  if (ra.startMinute !== rb.startMinute) return ra.startMinute - rb.startMinute;
  if (endA !== endB) return endA - endB;
  const goalCmp = a.goalId.localeCompare(b.goalId);
  if (goalCmp !== 0) return goalCmp;
  return a.quest.id.localeCompare(b.quest.id);
}

export type DailyQuestEntry = {
  goalId: string;
  goalTitle: string;
  quest: Quest;
};

type QuestProgressValue = {
  completed: Record<string, boolean>;
  toggleQuest: (id: string) => void;
  dailyQuests: Quest[];
  dailyQuestEntries: DailyQuestEntry[];
  weeklyQuests: Quest[];
  /** Per-goal quest points accumulated toward the milestone bar (persisted). */
  goalBarEarned: Record<string, number>;
  streak: number;
  pointsToday: number;
  lifetimeQuestPoints: number;
  questsCompletedCount: number;
};

const QuestProgressContext = createContext<QuestProgressValue | null>(null);

export function QuestProgressProvider({ children }: { children: React.ReactNode }) {
  const { userId, authReady } = useAuthUser();
  const { goals } = useActiveGoals();
  const { streak, pointsToday, lifetimeQuestPoints, applyQuestToggle } =
    useDailyStreakAndPointsToday(userId, authReady);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [goalBarEarned, setGoalBarEarned] = useState<Record<string, number>>({});
  const [weeklyQuests, setWeeklyQuests] = useState<Quest[]>([]);
  const completedRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    completedRef.current = completed;
  }, [completed]);

  const activeGoals = useMemo(() => goals.filter((g) => !g.completed), [goals]);

  const dailyQuestEntries = useMemo((): DailyQuestEntry[] => {
    if (activeGoals.length === 0) {
      return [];
    }
    const entries = activeGoals.flatMap((g) =>
      (g.dailyQuests ?? []).map((quest) => ({
        goalId: g.id,
        goalTitle: g.title,
        quest,
      })),
    );
    entries.sort(compareDailyEntriesByScheduleTime);
    return entries;
  }, [activeGoals]);

  const dailyQuests = useMemo(
    () => dailyQuestEntries.map((e) => e.quest),
    [dailyQuestEntries],
  );

  useEffect(() => {
    if (!authReady) return;
    if (userId === null) {
      setWeeklyQuests([]);
      return;
    }
    let cancelled = false;
    void fetchWeeklyQuestsForUser(userId).then((w) => {
      if (!cancelled) setWeeklyQuests(w);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, authReady]);

  const allQuestsForToggle = useMemo(
    () => [...dailyQuests, ...weeklyQuests],
    [dailyQuests, weeklyQuests],
  );

  useEffect(() => {
    if (!authReady) return;
    if (userId === null) {
      setCompleted({});
      setGoalBarEarned({});
      return;
    }
    let cancelled = false;
    void Promise.all([fetchQuestCompletionsMap(userId), fetchGoalBarEarnedMap(userId)]).then(
      ([cMap, eMap]) => {
        if (!cancelled) {
          setCompleted(cMap);
          setGoalBarEarned(eMap);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId, authReady]);

  const toggleQuest = useCallback(
    (id: string) => {
      const quest = allQuestsForToggle.find((q) => q.id === id);
      if (!quest) return;

      const prevDone = completedRef.current[id] ?? false;
      const nextCompleted = !prevDone;
      const nextMap = { ...completedRef.current, [id]: nextCompleted };
      completedRef.current = nextMap;
      setCompleted(nextMap);

      const entry = dailyQuestEntries.find((e) => e.quest.id === id);
      if (entry?.goalId) {
        const delta = nextCompleted ? quest.points : -quest.points;
        setGoalBarEarned((prevEarned) => {
          const nextEarned = { ...prevEarned };
          const cur = nextEarned[entry.goalId] ?? 0;
          const earned = Math.max(0, cur + delta);
          nextEarned[entry.goalId] = earned;
          if (userId) {
            queueMicrotask(() => void upsertGoalBarEarned(userId, entry.goalId, earned));
          }
          return nextEarned;
        });
      }

      queueMicrotask(() => {
        if (userId && entry?.goalId) void upsertQuestCompletion(userId, id, nextCompleted);
        applyQuestToggle(quest, nextCompleted);
      });
    },
    [allQuestsForToggle, applyQuestToggle, dailyQuestEntries, userId],
  );

  const questsCompletedCount = useMemo(
    () => Object.values(completed).filter(Boolean).length,
    [completed],
  );

  const value = useMemo(
    () => ({
      completed,
      toggleQuest,
      dailyQuests,
      dailyQuestEntries,
      weeklyQuests,
      goalBarEarned,
      streak,
      pointsToday,
      lifetimeQuestPoints,
      questsCompletedCount,
    }),
    [
      completed,
      toggleQuest,
      dailyQuests,
      dailyQuestEntries,
      weeklyQuests,
      goalBarEarned,
      streak,
      pointsToday,
      lifetimeQuestPoints,
      questsCompletedCount,
    ],
  );

  return (
    <QuestProgressContext.Provider value={value}>{children}</QuestProgressContext.Provider>
  );
}

export function useQuestProgress() {
  const ctx = useContext(QuestProgressContext);
  if (!ctx) {
    throw new Error('useQuestProgress must be used within QuestProgressProvider');
  }
  return ctx;
}
