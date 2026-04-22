import { supabase } from '../../lib/supabase';
import type { Quest } from '../../types';

export async function fetchQuestCompletionsMap(userId: string): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from('quest_completions')
    .select('quest_id, completed')
    .eq('user_id', userId);
  if (error) {
    console.error('[questProgressRepository] fetch completions', error.message);
    return {};
  }
  const out: Record<string, boolean> = {};
  for (const row of data ?? []) {
    const r = row as { quest_id: string; completed: boolean };
    out[r.quest_id] = r.completed;
  }
  return out;
}

export async function upsertQuestCompletion(
  userId: string,
  questId: string,
  completed: boolean,
): Promise<void> {
  const { error } = await supabase.from('quest_completions').upsert(
    {
      user_id: userId,
      quest_id: questId,
      completed,
    },
    { onConflict: 'user_id,quest_id' },
  );
  if (error) console.error('[questProgressRepository] upsert completion', error.message);
}

export async function fetchGoalBarEarnedMap(userId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('goal_bar_earned')
    .select('goal_id, earned_points')
    .eq('user_id', userId);
  if (error) {
    console.error('[questProgressRepository] fetch goal bar', error.message);
    return {};
  }
  const out: Record<string, number> = {};
  for (const row of data ?? []) {
    const r = row as { goal_id: string; earned_points: number };
    out[r.goal_id] = r.earned_points;
  }
  return out;
}

export async function upsertGoalBarEarned(
  userId: string,
  goalId: string,
  earnedPoints: number,
): Promise<void> {
  const { error } = await supabase.from('goal_bar_earned').upsert(
    {
      user_id: userId,
      goal_id: goalId,
      earned_points: earnedPoints,
    },
    { onConflict: 'user_id,goal_id' },
  );
  if (error) console.error('[questProgressRepository] upsert goal bar', error.message);
}

/** User-scoped weekly quest ids (stable per account). */
export function weeklyQuestId(userId: string, index1Based: number): string {
  return `weekly-${index1Based}-${userId}`;
}

/** Map legacy mock ids to DB weekly ids after seeding. */
export function remapLegacyWeeklyCompletionKeys(
  map: Record<string, boolean>,
  userId: string,
): Record<string, boolean> {
  const out = { ...map };
  const pairs: [string, string][] = [
    ['wq-1', weeklyQuestId(userId, 1)],
    ['wq-2', weeklyQuestId(userId, 2)],
  ];
  for (const [oldId, newId] of pairs) {
    if (oldId in out) {
      out[newId] = out[oldId] ?? false;
      delete out[oldId];
    }
  }
  return out;
}

export function mapQuestRowToQuest(row: {
  id: string;
  title: string;
  description: string;
  points: number;
  kind: 'daily' | 'weekly';
  day_order: number | null;
  schedule_start_minute: number | null;
  schedule_duration_minutes: number | null;
}): Quest {
  const q: Quest = {
    id: row.id,
    title: row.title,
    description: row.description,
    points: row.points,
    kind: row.kind,
  };
  if (row.day_order != null) q.dayOrder = row.day_order;
  if (row.schedule_start_minute != null) q.scheduleStartMinute = row.schedule_start_minute;
  if (row.schedule_duration_minutes != null) q.scheduleDurationMinutes = row.schedule_duration_minutes;
  return q;
}
