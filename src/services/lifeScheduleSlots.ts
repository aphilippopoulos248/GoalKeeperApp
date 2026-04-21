import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ReservedScheduleSlot } from './openaiGoalPlanner';

const LIFE_SCHEDULE_SLOTS_KEY = '@goalkeeper/life-schedule-slots-v1';

function normalizeSlot(s: ReservedScheduleSlot): ReservedScheduleSlot | null {
  const start = Math.min(1439, Math.max(0, Math.round(s.startMinute)));
  const end = Math.min(1440, Math.max(0, Math.round(s.endMinute)));
  if (end <= start) return null;
  return { startMinute: start, endMinute: end };
}

export async function loadLifeScheduleSlots(): Promise<ReservedScheduleSlot[]> {
  try {
    const raw = await AsyncStorage.getItem(LIFE_SCHEDULE_SLOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: ReservedScheduleSlot[] = [];
    for (const x of parsed) {
      if (!x || typeof x !== 'object') continue;
      const o = x as Record<string, unknown>;
      const sm = o.startMinute;
      const em = o.endMinute;
      if (typeof sm !== 'number' || typeof em !== 'number') continue;
      const n = normalizeSlot({ startMinute: sm, endMinute: em });
      if (n) out.push(n);
    }
    return out;
  } catch {
    return [];
  }
}

export async function saveLifeScheduleSlots(
  slots: ReservedScheduleSlot[],
): Promise<void> {
  const normalized = slots
    .map((s) => normalizeSlot(s))
    .filter((x): x is ReservedScheduleSlot => x != null);
  await AsyncStorage.setItem(LIFE_SCHEDULE_SLOTS_KEY, JSON.stringify(normalized));
}
