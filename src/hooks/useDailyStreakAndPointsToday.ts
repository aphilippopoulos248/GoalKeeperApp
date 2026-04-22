import { useCallback, useEffect, useState } from 'react';

import { getItemScopedWithLegacyMigrate, setItemScoped } from '../lib/userScopedStorage';
import type { Quest } from '../types';

const STREAK_BASE_KEY = '@goalkeeper/daily-streak-v1';
const POINTS_TODAY_BASE_KEY = '@goalkeeper/points-today-v1';
const LIFETIME_QUEST_POINTS_BASE_KEY = '@goalkeeper/lifetime-quest-points-v1';

type StreakPersisted = {
  streak: number;
  lastDailyActivityDate: string | null;
};

type PointsPersisted = {
  date: string;
  points: number;
};

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function yesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatLocalDate(d);
}

async function loadStreak(userId: string | null): Promise<StreakPersisted> {
  try {
    const raw = await getItemScopedWithLegacyMigrate(STREAK_BASE_KEY, userId);
    if (!raw) return { streak: 0, lastDailyActivityDate: null };
    const parsed = JSON.parse(raw) as StreakPersisted;
    return {
      streak: typeof parsed.streak === 'number' ? parsed.streak : 0,
      lastDailyActivityDate:
        typeof parsed.lastDailyActivityDate === 'string' ||
        parsed.lastDailyActivityDate === null
          ? parsed.lastDailyActivityDate
          : null,
    };
  } catch {
    return { streak: 0, lastDailyActivityDate: null };
  }
}

async function saveStreak(userId: string | null, data: StreakPersisted): Promise<void> {
  await setItemScoped(STREAK_BASE_KEY, userId, JSON.stringify(data));
}

async function loadPointsToday(userId: string | null): Promise<PointsPersisted> {
  try {
    const raw = await getItemScopedWithLegacyMigrate(POINTS_TODAY_BASE_KEY, userId);
    if (!raw) return { date: formatLocalDate(new Date()), points: 0 };
    const parsed = JSON.parse(raw) as PointsPersisted;
    return {
      date: typeof parsed.date === 'string' ? parsed.date : formatLocalDate(new Date()),
      points: typeof parsed.points === 'number' ? parsed.points : 0,
    };
  } catch {
    return { date: formatLocalDate(new Date()), points: 0 };
  }
}

async function savePointsToday(userId: string | null, data: PointsPersisted): Promise<void> {
  await setItemScoped(POINTS_TODAY_BASE_KEY, userId, JSON.stringify(data));
}

function normalizePointsForToday(stored: PointsPersisted): PointsPersisted {
  const today = formatLocalDate(new Date());
  if (stored.date !== today) {
    return { date: today, points: 0 };
  }
  return stored;
}

async function loadLifetimeQuestPoints(userId: string | null): Promise<number> {
  try {
    const raw = await getItemScopedWithLegacyMigrate(LIFETIME_QUEST_POINTS_BASE_KEY, userId);
    if (!raw) return 0;
    const n = JSON.parse(raw) as unknown;
    return typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : 0;
  } catch {
    return 0;
  }
}

async function saveLifetimeQuestPoints(userId: string | null, points: number): Promise<void> {
  await setItemScoped(LIFETIME_QUEST_POINTS_BASE_KEY, userId, JSON.stringify(points));
}

export function useDailyStreakAndPointsToday(
  userId: string | null,
  authReady: boolean,
) {
  const [streak, setStreak] = useState(0);
  const [pointsToday, setPointsToday] = useState(0);
  const [lifetimeQuestPoints, setLifetimeQuestPoints] = useState(0);

  useEffect(() => {
    if (!authReady) return;
    let cancelled = false;
    void (async () => {
      const [s, p, lifetime] = await Promise.all([
        loadStreak(userId),
        loadPointsToday(userId),
        loadLifetimeQuestPoints(userId),
      ]);
      if (cancelled) return;
      setStreak(s.streak);
      setLifetimeQuestPoints(lifetime);
      const normalized = normalizePointsForToday(p);
      setPointsToday(normalized.points);
      if (normalized.points !== p.points || normalized.date !== p.date) {
        await savePointsToday(userId, normalized);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, authReady]);

  const applyQuestToggle = useCallback(
    (quest: Quest, nowCompleted: boolean) => {
      const today = formatLocalDate(new Date());

      void (async () => {
        if (nowCompleted) {
          const ptsData = normalizePointsForToday(await loadPointsToday(userId));
          const nextPoints = ptsData.points + quest.points;
          setPointsToday(nextPoints);
          await savePointsToday(userId, { date: today, points: nextPoints });

          const prevLifetime = await loadLifetimeQuestPoints(userId);
          const nextLifetime = prevLifetime + quest.points;
          setLifetimeQuestPoints(nextLifetime);
          await saveLifetimeQuestPoints(userId, nextLifetime);

          if (quest.kind !== 'daily') return;

          const cur = await loadStreak(userId);
          const last = cur.lastDailyActivityDate;

          if (last === today) {
            return;
          }

          let nextStreak: number;
          if (last === null) {
            nextStreak = 1;
          } else if (last === yesterdayString()) {
            nextStreak = cur.streak + 1;
          } else {
            nextStreak = 1;
          }

          const next: StreakPersisted = {
            streak: nextStreak,
            lastDailyActivityDate: today,
          };
          await saveStreak(userId, next);
          setStreak(nextStreak);
        } else {
          const ptsData = normalizePointsForToday(await loadPointsToday(userId));
          const nextPoints = Math.max(0, ptsData.points - quest.points);
          setPointsToday(nextPoints);
          await savePointsToday(userId, { date: today, points: nextPoints });

          const prevLifetime = await loadLifetimeQuestPoints(userId);
          const nextLifetime = Math.max(0, prevLifetime - quest.points);
          setLifetimeQuestPoints(nextLifetime);
          await saveLifetimeQuestPoints(userId, nextLifetime);
        }
      })();
    },
    [userId],
  );

  return { streak, pointsToday, lifetimeQuestPoints, applyQuestToggle };
}
