import type { ReservedScheduleSlot } from './openaiGoalPlanner';
import { fetchLifeScheduleSlots, replaceLifeScheduleSlots } from './supabase/lifeScheduleRepository';

export async function loadLifeScheduleSlots(
  userId: string | null,
): Promise<ReservedScheduleSlot[]> {
  if (userId === null) return [];
  return fetchLifeScheduleSlots(userId);
}

export async function saveLifeScheduleSlots(
  userId: string | null,
  slots: ReservedScheduleSlot[],
): Promise<void> {
  if (userId === null) return;
  await replaceLifeScheduleSlots(userId, slots);
}
