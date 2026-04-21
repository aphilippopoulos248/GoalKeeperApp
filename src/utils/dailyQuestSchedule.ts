import type { Quest } from '../types';

const WAKE_START_MINUTE = 6 * 60;
const WAKE_END_MINUTE = 22 * 60;
const DEFAULT_BLOCK_MINUTES = 45;

function clampDayOrder(n: number): number {
  if (!Number.isFinite(n)) return 500;
  return Math.min(999, Math.max(0, Math.round(n)));
}

export function dayOrderForSchedule(quest: Quest): number {
  return typeof quest.dayOrder === 'number' && Number.isFinite(quest.dayOrder)
    ? clampDayOrder(quest.dayOrder)
    : 500;
}

/**
 * Resolved clock block for the day schedule. Uses persisted AI fields when present;
 * otherwise maps dayOrder into the 6:00–22:00 window (legacy / mock quests).
 */
export function resolveQuestScheduleBlock(
  quest: Quest,
  _index: number,
  _total: number,
): { startMinute: number; durationMinutes: number } {
  const durationMinutes =
    typeof quest.scheduleDurationMinutes === 'number' &&
    Number.isFinite(quest.scheduleDurationMinutes)
      ? Math.min(120, Math.max(15, Math.round(quest.scheduleDurationMinutes)))
      : DEFAULT_BLOCK_MINUTES;
  if (
    typeof quest.scheduleStartMinute === 'number' &&
    Number.isFinite(quest.scheduleStartMinute)
  ) {
    const startMinute = Math.min(
      1439,
      Math.max(0, Math.round(quest.scheduleStartMinute)),
    );
    return { startMinute, durationMinutes };
  }
  const span = Math.max(1, WAKE_END_MINUTE - WAKE_START_MINUTE - durationMinutes);
  const order = dayOrderForSchedule(quest);
  const startMinute = Math.min(
    WAKE_END_MINUTE - durationMinutes,
    WAKE_START_MINUTE + Math.round((order / 999) * span),
  );
  return { startMinute, durationMinutes };
}

export function formatScheduleRange(startMinute: number, endMinute: number): string {
  return `${formatMinuteLabel(startMinute)}–${formatMinuteLabel(endMinute)}`;
}

export function formatMinuteLabel(totalMinute: number): string {
  const m = Math.min(1439, Math.max(0, Math.round(totalMinute)));
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  const mm = min.toString().padStart(2, '0');
  return `${h12}:${mm} ${ampm}`;
}
