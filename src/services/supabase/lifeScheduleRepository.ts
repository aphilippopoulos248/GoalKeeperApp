import { supabase } from '../../lib/supabase';
import type { ReservedScheduleSlot } from '../openaiGoalPlanner';

import { ensurePublicProfileRow } from './ensurePublicProfile';

export async function fetchLifeScheduleSlots(userId: string): Promise<ReservedScheduleSlot[]> {
  const { data, error } = await supabase
    .from('life_schedule_slots')
    .select('start_minute, end_minute, sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[lifeScheduleRepository] fetch', error.message);
    return [];
  }

  const out: ReservedScheduleSlot[] = [];
  for (const row of data ?? []) {
    const r = row as { start_minute: number; end_minute: number };
    if (r.end_minute > r.start_minute) {
      out.push({ startMinute: r.start_minute, endMinute: r.end_minute });
    }
  }
  return out;
}

export async function replaceLifeScheduleSlots(
  userId: string,
  slots: ReservedScheduleSlot[],
): Promise<void> {
  const profileOk = await ensurePublicProfileRow(userId);
  if (!profileOk) return;
  const { error: delErr } = await supabase.from('life_schedule_slots').delete().eq('user_id', userId);
  if (delErr) {
    console.error('[lifeScheduleRepository] delete', delErr.message);
    return;
  }
  if (slots.length === 0) return;

  const rows = slots.map((s, i) => ({
    user_id: userId,
    start_minute: Math.min(1439, Math.max(0, Math.round(s.startMinute))),
    end_minute: Math.min(1440, Math.max(0, Math.round(s.endMinute))),
    sort_order: i,
  }));

  const { error: insErr } = await supabase.from('life_schedule_slots').insert(rows);
  if (insErr) console.error('[lifeScheduleRepository] insert', insErr.message);
}
