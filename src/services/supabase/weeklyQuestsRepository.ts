import { mockWeeklyQuests } from '../../data/mockQuests';
import { supabase } from '../../lib/supabase';
import type { Quest } from '../../types';

import { ensurePublicProfileRow } from './ensurePublicProfile';
import { mapQuestRowToQuest, weeklyQuestId } from './questProgressRepository';

export async function fetchOrSeedWeeklyQuests(userId: string): Promise<Quest[]> {
  await ensurePublicProfileRow(userId);
  const { data, error } = await supabase
    .from('quests')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', 'weekly')
    .order('id', { ascending: true });

  if (error) {
    console.error('[weeklyQuestsRepository] fetch', error.message);
    return mockWeeklyQuests.map((q, i) => ({ ...q, id: weeklyQuestId(userId, i + 1) }));
  }

  if (data && data.length >= mockWeeklyQuests.length) {
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
  if (upErr) console.error('[weeklyQuestsRepository] seed', upErr.message);

  return rows.map((r) =>
    mapQuestRowToQuest({
      id: r.id,
      title: r.title,
      description: r.description,
      points: r.points,
      kind: r.kind,
      day_order: r.day_order,
      schedule_start_minute: r.schedule_start_minute,
      schedule_duration_minutes: r.schedule_duration_minutes,
    }),
  );
}
