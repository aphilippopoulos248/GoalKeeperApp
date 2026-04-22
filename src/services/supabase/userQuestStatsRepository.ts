import { supabase } from '../../lib/supabase';
import type { Quest } from '../../types';

import { ensurePublicProfileRow } from './ensurePublicProfile';

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

export type UserQuestStatsState = {
  streak: number;
  pointsToday: number;
  lifetimeQuestPoints: number;
};

async function ensureStatsRow(userId: string): Promise<void> {
  const profileOk = await ensurePublicProfileRow(userId);
  if (!profileOk) return;
  const { data } = await supabase
    .from('user_quest_stats')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (data) return;
  const { error } = await supabase.from('user_quest_stats').insert({ user_id: userId });
  if (error && !error.message.includes('duplicate')) {
    console.error('[userQuestStatsRepository] insert stats', error.message);
  }
}

export async function loadUserQuestStats(userId: string): Promise<UserQuestStatsState> {
  await ensureStatsRow(userId);
  const { data, error } = await supabase
    .from('user_quest_stats')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error('[userQuestStatsRepository] load', error.message);
    }
    return { streak: 0, pointsToday: 0, lifetimeQuestPoints: 0 };
  }

  const today = formatLocalDate(new Date());
  const row = data as {
    streak: number;
    last_daily_activity_date: string | null;
    points_today_date: string;
    points_today: number;
    lifetime_quest_points: number;
  };

  let pointsToday = row.points_today;
  if (row.points_today_date !== today) {
    pointsToday = 0;
    await supabase
      .from('user_quest_stats')
      .update({ points_today: 0, points_today_date: today })
      .eq('user_id', userId);
  }

  return {
    streak: row.streak,
    pointsToday,
    lifetimeQuestPoints: row.lifetime_quest_points,
  };
}

export async function applyQuestToggleToStats(
  userId: string,
  quest: Quest,
  nowCompleted: boolean,
): Promise<void> {
  await ensureStatsRow(userId);
  const today = formatLocalDate(new Date());

  const { data, error } = await supabase
    .from('user_quest_stats')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) {
    if (error) {
      console.error('[userQuestStatsRepository] apply toggle read', error.message);
    }
    return;
  }

  const row = data as {
    streak: number;
    last_daily_activity_date: string | null;
    points_today_date: string;
    points_today: number;
    lifetime_quest_points: number;
  };

  let pointsToday = row.points_today;
  if (row.points_today_date !== today) {
    pointsToday = 0;
  }

  let nextLifetime = row.lifetime_quest_points;
  let nextPointsToday = pointsToday;
  let nextStreak = row.streak;
  let nextLastDaily = row.last_daily_activity_date;

  if (nowCompleted) {
    nextPointsToday = pointsToday + quest.points;
    nextLifetime = row.lifetime_quest_points + quest.points;

    if (quest.kind === 'daily') {
      const last = row.last_daily_activity_date;
      if (last !== today) {
        if (last === null) {
          nextStreak = 1;
        } else if (last === yesterdayString()) {
          nextStreak = row.streak + 1;
        } else {
          nextStreak = 1;
        }
        nextLastDaily = today;
      }
    }
  } else {
    nextPointsToday = Math.max(0, pointsToday - quest.points);
    nextLifetime = Math.max(0, row.lifetime_quest_points - quest.points);
  }

  const { error: upErr } = await supabase
    .from('user_quest_stats')
    .update({
      points_today: nextPointsToday,
      points_today_date: today,
      lifetime_quest_points: nextLifetime,
      streak: nextStreak,
      last_daily_activity_date: nextLastDaily,
    })
    .eq('user_id', userId);

  if (upErr) console.error('[userQuestStatsRepository] apply toggle write', upErr.message);
}
