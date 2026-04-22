import { useCallback, useEffect, useState } from 'react';

import {
  applyQuestToggleToStats,
  loadUserQuestStats,
} from '../services/supabase/userQuestStatsRepository';
import type { Quest } from '../types';

export function useDailyStreakAndPointsToday(
  userId: string | null,
  authReady: boolean,
) {
  const [streak, setStreak] = useState(0);
  const [pointsToday, setPointsToday] = useState(0);
  const [lifetimeQuestPoints, setLifetimeQuestPoints] = useState(0);

  useEffect(() => {
    if (!authReady) return;
    if (userId === null) {
      setStreak(0);
      setPointsToday(0);
      setLifetimeQuestPoints(0);
      return;
    }
    let cancelled = false;
    void loadUserQuestStats(userId).then((s) => {
      if (cancelled) return;
      setStreak(s.streak);
      setPointsToday(s.pointsToday);
      setLifetimeQuestPoints(s.lifetimeQuestPoints);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, authReady]);

  const applyQuestToggle = useCallback(
    (quest: Quest, nowCompleted: boolean) => {
      if (userId === null) {
        return;
      }
      void (async () => {
        await applyQuestToggleToStats(userId, quest, nowCompleted);
        const s = await loadUserQuestStats(userId);
        setStreak(s.streak);
        setPointsToday(s.pointsToday);
        setLifetimeQuestPoints(s.lifetimeQuestPoints);
      })();
    },
    [userId],
  );

  return { streak, pointsToday, lifetimeQuestPoints, applyQuestToggle };
}
