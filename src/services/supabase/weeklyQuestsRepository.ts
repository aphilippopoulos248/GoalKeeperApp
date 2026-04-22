import { mockWeeklyQuests } from '../../data/mockQuests';
import { supabase } from '../../lib/supabase';
import type { Quest } from '../../types';

import { ensurePublicProfileRow } from './ensurePublicProfile';
import { mapQuestRowToQuest, weeklyQuestId } from './questProgressRepository';

/**
 * Returns weekly quests stored in Supabase for this user only. No rows are created here;
 * new accounts get an empty list until something else inserts weeklies (if ever).
 */
export async function fetchWeeklyQuestsForUser(userId: string): Promise<Quest[]> {
  const profileOk = await ensurePublicProfileRow(userId);
  if (!profileOk) return [];

  const { data, error } = await supabase
    .from('quests')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', 'weekly')
    .order('id', { ascending: true });

  if (error) {
    console.error('[weeklyQuestsRepository] fetch', error.message);
    return [];
  }

  if (!data?.length) return [];

  return data.map((row) =>
    mapQuestRowToQuest(
      row as {
        id: string;
        title: string;
        description: string;
        points: number;
        kind: 'daily' | 'weekly';
        day_order: number | null;
        schedule_start_minute: number | null;
        schedule_duration_minutes: number | null;
      },
    ),
  );
}

/**
 * Inserts weekly template quests into DB so legacy `quest_completions` migration can satisfy FKs.
 * Called only when importing old AsyncStorage completion data that references weekly ids.
 */
export async function ensureWeeklyQuestRowsInDb(userId: string): Promise<void> {
  const profileOk = await ensurePublicProfileRow(userId);
  if (!profileOk) return;

  const rows = mockWeeklyQuests.map((t, i) => ({
    id: weeklyQuestId(userId, i + 1),
    user_id: userId,
    goal_id: null as string | null,
    title: t.title,
    description: t.description,
    points: t.points,
    kind: 'weekly' as const,
    day_order: null as number | null,
    schedule_start_minute: null as number | null,
    schedule_duration_minutes: null as number | null,
  }));

  const { error: upErr } = await supabase.from('quests').upsert(rows, { onConflict: 'id' });
  if (upErr) console.error('[weeklyQuestsRepository] migration seed weeklies', upErr.message);
}
