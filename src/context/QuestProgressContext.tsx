import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { mockDailyQuests, mockWeeklyQuests } from '../data/mockQuests';
import { useDailyStreakAndPointsToday } from '../hooks/useDailyStreakAndPointsToday';
import type { Quest } from '../types';
import { resolveQuestScheduleBlock } from '../utils/dailyQuestSchedule';

import { useActiveGoals } from './ActiveGoalsContext';

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

const QUEST_COMPLETED_KEY = '@goalkeeper/quest-completed-v1';

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
  streak: number;
  pointsToday: number;
  lifetimeQuestPoints: number;
  questsCompletedCount: number;
};

const QuestProgressContext = createContext<QuestProgressValue | null>(null);

async function loadCompleted(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(QUEST_COMPLETED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

async function saveCompleted(map: Record<string, boolean>): Promise<void> {
  await AsyncStorage.setItem(QUEST_COMPLETED_KEY, JSON.stringify(map));
}

export function QuestProgressProvider({ children }: { children: React.ReactNode }) {
  const { goals } = useActiveGoals();
  const { streak, pointsToday, lifetimeQuestPoints, applyQuestToggle } =
    useDailyStreakAndPointsToday();
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  const activeGoals = useMemo(() => goals.filter((g) => !g.completed), [goals]);

  const dailyQuestEntries = useMemo((): DailyQuestEntry[] => {
    if (activeGoals.length === 0) {
      return mockDailyQuests.map((quest) => ({
        goalId: '',
        goalTitle: 'Daily',
        quest,
      }));
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

  const weeklyQuests = mockWeeklyQuests;

  const allQuestsForToggle = useMemo(
    () => [...dailyQuests, ...weeklyQuests],
    [dailyQuests, weeklyQuests],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = await loadCompleted();
      if (!cancelled) setCompleted(map);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleQuest = useCallback(
    (id: string) => {
      const quest = allQuestsForToggle.find((q) => q.id === id);
      if (!quest) return;

      setCompleted((prev) => {
        const nextCompleted = !prev[id];
        const nextMap = { ...prev, [id]: nextCompleted };
        queueMicrotask(() => {
          void saveCompleted(nextMap);
          applyQuestToggle(quest, nextCompleted);
        });
        return nextMap;
      });
    },
    [allQuestsForToggle, applyQuestToggle],
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
