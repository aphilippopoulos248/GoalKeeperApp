import type { Goal } from '../types';

const MIN_TARGET = 15;
const MAX_TARGET = 80;
const MIN_DAYS = 7;
const MAX_DAYS = 365;
const DEFAULT_DAYS = 60;

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * Days from today (local) until deadline, clamped to [1, MAX_DAYS].
 * Missing or invalid date uses DEFAULT_DAYS (mid-range target).
 */
export function daysUntilGoalDeadline(targetDateIso: string | undefined): number {
  if (!targetDateIso) return DEFAULT_DAYS;
  const t = new Date(targetDateIso);
  if (Number.isNaN(t.getTime())) return DEFAULT_DAYS;
  const today = startOfLocalDay(new Date());
  const deadline = startOfLocalDay(t);
  const diffMs = deadline.getTime() - today.getTime();
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(MAX_DAYS, days));
}

/**
 * Full bar cost: shorter time horizons (fewer days left) use a lower target;
 * longer horizons use a higher target (testing-friendly range ~15–80).
 */
export function computeGoalBarTargetPoints(goal: Pick<Goal, 'targetDateIso'>): number {
  const days = daysUntilGoalDeadline(goal.targetDateIso);
  const t = (days - MIN_DAYS) / (MAX_DAYS - MIN_DAYS);
  const clampedT = Math.max(0, Math.min(1, t));
  return Math.round(MIN_TARGET + clampedT * (MAX_TARGET - MIN_TARGET));
}
