import type { Goal, Quest } from '../types';

const WAKE_START_MINUTE = 6 * 60;
const WAKE_END_MINUTE = 22 * 60;
const DEFAULT_BLOCK_MINUTES = 45;
const MIN_SCHEDULE_BLOCK_MINUTES = 15;
const MAX_SCHEDULE_BLOCK_MINUTES = 120;

/** Clamp daily block length to the same bounds as persisted quests / AI planner. */
export function clampScheduleDurationMinutes(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_BLOCK_MINUTES;
  return Math.min(
    MAX_SCHEDULE_BLOCK_MINUTES,
    Math.max(MIN_SCHEDULE_BLOCK_MINUTES, Math.round(n)),
  );
}

/** Keep start so the half-open block [start, start + duration) fits in [0, 1440). */
export function clampScheduleStartMinute(
  startMinute: number,
  durationMinutes: number,
): number {
  const d = clampScheduleDurationMinutes(durationMinutes);
  const s = Math.round(startMinute);
  return Math.min(1440 - d, Math.max(0, s));
}

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
      ? clampScheduleDurationMinutes(quest.scheduleDurationMinutes)
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

/**
 * Minute ranges [startMinute, endMinute) already used by other goals’ daily quests.
 * Used when generating new dailies so schedules do not overlap across goals.
 */
export function collectOccupiedDailySlots(
  goals: Goal[],
  excludeGoalId?: string,
): Array<{ startMinute: number; endMinute: number }> {
  const slots: Array<{ startMinute: number; endMinute: number }> = [];
  for (const g of goals) {
    if (g.completed) continue;
    if (excludeGoalId != null && g.id === excludeGoalId) continue;
    const dailies = (g.dailyQuests ?? []).filter((q) => q.kind === 'daily');
    const n = dailies.length;
    dailies.forEach((quest, i) => {
      const { startMinute, durationMinutes } = resolveQuestScheduleBlock(
        quest,
        i,
        Math.max(n, 1),
      );
      const endMinute = Math.min(24 * 60, startMinute + durationMinutes);
      if (endMinute > startMinute) {
        slots.push({ startMinute, endMinute });
      }
    });
  }
  return slots;
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
