import AsyncStorage from '@react-native-async-storage/async-storage';

import { getItemScopedWithLegacyMigrate, storageKeyForUser } from '../../lib/userScopedStorage';
import { ensurePublicProfileRow } from './ensurePublicProfile';

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
import { normalizeGoal } from '../../utils/goalNormalize';
import { supabase } from '../../lib/supabase';

import {
  LEGACY_GOAL_BAR_EARNED_KEY,
  LEGACY_GOALS_KEY,
  LEGACY_LIFE_SCHEDULE_KEY,
  LEGACY_LIFETIME_POINTS_KEY,
  LEGACY_POINTS_TODAY_KEY,
  LEGACY_QUEST_COMPLETED_KEY,
  LEGACY_STREAK_KEY,
} from './storageKeys';
import { fetchGoalsForUser, syncGoalsForUser } from './goalsRepository';
import { remapLegacyWeeklyCompletionKeys } from './questProgressRepository';
import { replaceLifeScheduleSlots } from './lifeScheduleRepository';
import { fetchOrSeedWeeklyQuests } from './weeklyQuestsRepository';
import type { ReservedScheduleSlot } from '../openaiGoalPlanner';
import type { Goal } from '../../types';

async function remoteGoalsNonEmpty(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('goals')
    .select('id')
    .eq('user_id', userId)
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

async function remoteCompletionsNonEmpty(userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('quest_completions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) return false;
  return (count ?? 0) > 0;
}

async function remoteGoalBarNonEmpty(userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('goal_bar_earned')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) return false;
  return (count ?? 0) > 0;
}

async function remoteLifeSlotsNonEmpty(userId: string): Promise<boolean> {
  const { count, error } = await supabase
    .from('life_schedule_slots')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);
  if (error) return false;
  return (count ?? 0) > 0;
}

function clearScoped(userId: string, baseKey: string): Promise<void> {
  return AsyncStorage.removeItem(storageKeyForUser(baseKey, userId));
}

/**
 * One-shot migration from per-user AsyncStorage into Supabase when the cloud copy is empty.
 * Safe to call on every sign-in; no-ops when legacy keys are missing or cloud already has data.
 */
export async function migrateLegacyLocalData(userId: string): Promise<void> {
  if (!userId) return;

  try {
    const profileOk = await ensurePublicProfileRow(userId);
    if (!profileOk) return;
    const hasRemoteGoals = await remoteGoalsNonEmpty(userId);
    const rawGoals = await getItemScopedWithLegacyMigrate(LEGACY_GOALS_KEY, userId);
    if (rawGoals && !hasRemoteGoals) {
      const parsed = JSON.parse(rawGoals) as unknown;
      if (Array.isArray(parsed)) {
        const goals = parsed.map(normalizeGoal).filter((g): g is Goal => g !== null);
        if (goals.length > 0) {
          await syncGoalsForUser(userId, goals);
          await clearScoped(userId, LEGACY_GOALS_KEY);
        }
      }
    } else if (hasRemoteGoals && rawGoals) {
      await clearScoped(userId, LEGACY_GOALS_KEY);
    }

    if (!(await remoteCompletionsNonEmpty(userId))) {
      await fetchOrSeedWeeklyQuests(userId);
      const raw = await getItemScopedWithLegacyMigrate(LEGACY_QUEST_COMPLETED_KEY, userId);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object') {
          let map: Record<string, boolean> = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'boolean') map[k] = v;
          }
          map = remapLegacyWeeklyCompletionKeys(map, userId);
          const rows = Object.entries(map).map(([quest_id, completed]) => ({
            user_id: userId,
            quest_id,
            completed,
          }));
          if (rows.length) {
            const { error: cErr } = await supabase
              .from('quest_completions')
              .upsert(rows, { onConflict: 'user_id,quest_id' });
            if (!cErr) await clearScoped(userId, LEGACY_QUEST_COMPLETED_KEY);
          }
        }
      }
    } else {
      const raw = await getItemScopedWithLegacyMigrate(LEGACY_QUEST_COMPLETED_KEY, userId);
      if (raw) await clearScoped(userId, LEGACY_QUEST_COMPLETED_KEY);
    }

    if (!(await remoteGoalBarNonEmpty(userId))) {
      const raw = await getItemScopedWithLegacyMigrate(LEGACY_GOAL_BAR_EARNED_KEY, userId);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object') {
          const rows: { user_id: string; goal_id: string; earned_points: number }[] = [];
          for (const [goal_id, v] of Object.entries(parsed)) {
            if (typeof v === 'number' && Number.isFinite(v)) {
              rows.push({ user_id: userId, goal_id, earned_points: Math.max(0, v) });
            }
          }
          if (rows.length) {
            const { error: gbErr } = await supabase
              .from('goal_bar_earned')
              .upsert(rows, { onConflict: 'user_id,goal_id' });
            if (!gbErr) await clearScoped(userId, LEGACY_GOAL_BAR_EARNED_KEY);
          }
        }
      }
    } else {
      const raw = await getItemScopedWithLegacyMigrate(LEGACY_GOAL_BAR_EARNED_KEY, userId);
      if (raw) await clearScoped(userId, LEGACY_GOAL_BAR_EARNED_KEY);
    }

    const { data: statsRow } = await supabase
      .from('user_quest_stats')
      .select('lifetime_quest_points, streak, points_today, last_daily_activity_date')
      .eq('user_id', userId)
      .maybeSingle();

    const row = statsRow as
      | {
          lifetime_quest_points: number;
          streak: number;
          points_today: number;
          last_daily_activity_date: string | null;
        }
      | undefined;

    const hasMeaningfulRemoteStats =
      row != null &&
      (row.lifetime_quest_points > 0 ||
        row.streak > 0 ||
        row.points_today > 0 ||
        row.last_daily_activity_date != null);

    const rawStreak = await getItemScopedWithLegacyMigrate(LEGACY_STREAK_KEY, userId);
    const rawPts = await getItemScopedWithLegacyMigrate(LEGACY_POINTS_TODAY_KEY, userId);
    const rawLife = await getItemScopedWithLegacyMigrate(LEGACY_LIFETIME_POINTS_KEY, userId);

    if (hasMeaningfulRemoteStats) {
      if (rawStreak) await clearScoped(userId, LEGACY_STREAK_KEY);
      if (rawPts) await clearScoped(userId, LEGACY_POINTS_TODAY_KEY);
      if (rawLife) await clearScoped(userId, LEGACY_LIFETIME_POINTS_KEY);
    } else if (rawStreak || rawPts || rawLife) {
      let streak = 0;
      let lastDaily: string | null = null;
      if (rawStreak) {
        try {
          const s = JSON.parse(rawStreak) as { streak?: unknown; lastDailyActivityDate?: unknown };
          streak = typeof s.streak === 'number' ? s.streak : 0;
          lastDaily =
            typeof s.lastDailyActivityDate === 'string' || s.lastDailyActivityDate === null
              ? (s.lastDailyActivityDate as string | null)
              : null;
        } catch {
          /* ignore */
        }
      }
      let pointsToday = 0;
      let pointsTodayDate = formatLocalDate(new Date());
      if (rawPts) {
        try {
          const p = JSON.parse(rawPts) as { date?: unknown; points?: unknown };
          if (typeof p.date === 'string') pointsTodayDate = p.date;
          pointsToday = typeof p.points === 'number' ? p.points : 0;
        } catch {
          /* ignore */
        }
      }
      let lifetime = 0;
      if (rawLife) {
        try {
          const n = JSON.parse(rawLife) as unknown;
          lifetime = typeof n === 'number' && Number.isFinite(n) ? Math.max(0, n) : 0;
        } catch {
          /* ignore */
        }
      }
      const { error: stErr } = await supabase.from('user_quest_stats').upsert(
        {
          user_id: userId,
          streak,
          last_daily_activity_date: lastDaily,
          points_today_date: pointsTodayDate,
          points_today: pointsToday,
          lifetime_quest_points: lifetime,
        },
        { onConflict: 'user_id' },
      );
      if (!stErr) {
        if (rawStreak) await clearScoped(userId, LEGACY_STREAK_KEY);
        if (rawPts) await clearScoped(userId, LEGACY_POINTS_TODAY_KEY);
        if (rawLife) await clearScoped(userId, LEGACY_LIFETIME_POINTS_KEY);
      }
    }

    if (!(await remoteLifeSlotsNonEmpty(userId))) {
      const raw = await getItemScopedWithLegacyMigrate(LEGACY_LIFE_SCHEDULE_KEY, userId);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            const slots: ReservedScheduleSlot[] = [];
            for (const x of parsed) {
              if (!x || typeof x !== 'object') continue;
              const o = x as Record<string, unknown>;
              if (typeof o.startMinute !== 'number' || typeof o.endMinute !== 'number') continue;
              const sm = Math.min(1439, Math.max(0, Math.round(o.startMinute)));
              const em = Math.min(1440, Math.max(0, Math.round(o.endMinute)));
              if (em > sm) slots.push({ startMinute: sm, endMinute: em });
            }
            if (slots.length) {
              await replaceLifeScheduleSlots(userId, slots);
              await clearScoped(userId, LEGACY_LIFE_SCHEDULE_KEY);
            }
          }
        } catch {
          /* ignore */
        }
      }
    } else {
      const raw = await getItemScopedWithLegacyMigrate(LEGACY_LIFE_SCHEDULE_KEY, userId);
      if (raw) await clearScoped(userId, LEGACY_LIFE_SCHEDULE_KEY);
    }
  } catch (e) {
    console.error('[legacyMigration]', e);
  }
}
