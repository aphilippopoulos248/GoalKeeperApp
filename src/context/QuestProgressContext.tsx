import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { allMockQuests } from '../data/mockQuests';
import { useDailyStreakAndPointsToday } from '../hooks/useDailyStreakAndPointsToday';

const QUEST_COMPLETED_KEY = '@goalkeeper/quest-completed-v1';

type QuestProgressValue = {
  completed: Record<string, boolean>;
  toggleQuest: (id: string) => void;
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
  const { streak, pointsToday, lifetimeQuestPoints, applyQuestToggle } =
    useDailyStreakAndPointsToday();
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

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
      const quest = allMockQuests.find((q) => q.id === id);
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
    [applyQuestToggle],
  );

  const questsCompletedCount = useMemo(
    () => Object.values(completed).filter(Boolean).length,
    [completed],
  );

  const value = useMemo(
    () => ({
      completed,
      toggleQuest,
      streak,
      pointsToday,
      lifetimeQuestPoints,
      questsCompletedCount,
    }),
    [completed, toggleQuest, streak, pointsToday, lifetimeQuestPoints, questsCompletedCount],
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
