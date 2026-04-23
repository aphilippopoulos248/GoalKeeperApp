import type { Goal } from '../types';

/** Bar target ≈ `weeks × pointsPerWeek`, with per-week rate in [MIN, MAX]. */
const MIN_POINTS_PER_WEEK = 250;
const MAX_POINTS_PER_WEEK = 300;
/** Spread the per-week rate across goal lengths (1 week → 350/wk, 52+ weeks → 400/wk). */
const INTERPOLATE_WEEKS_MIN = 1;
const INTERPOLATE_WEEKS_MAX = 52;

const MAX_DAYS_AHEAD = 365;
const DEFAULT_DAYS_REMAINING = 60;

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseIso(iso: string | undefined): Date | null {
  if (!iso?.trim()) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Days from today (local) until deadline, clamped to [1, MAX_DAYS_AHEAD].
 * Missing or invalid date uses DEFAULT_DAYS_REMAINING.
 */
export function daysUntilGoalDeadline(targetDateIso: string | undefined): number {
  if (!targetDateIso) return DEFAULT_DAYS_REMAINING;
  const t = new Date(targetDateIso);
  if (Number.isNaN(t.getTime())) return DEFAULT_DAYS_REMAINING;
  const today = startOfLocalDay(new Date());
  const deadline = startOfLocalDay(t);
  const diffMs = deadline.getTime() - today.getTime();
  const days = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(MAX_DAYS_AHEAD, days));
}

/** At least one week; whole weeks from start-of-day `a` through end-of-day span to `b`. */
function wholeWeeksFromStartToDeadline(start: Date, end: Date): number {
  const ms = startOfLocalDay(end).getTime() - startOfLocalDay(start).getTime();
  const days = Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  return Math.max(1, Math.ceil(days / 7));
}

function maxCheckpointWeekOffset(goal: Pick<Goal, 'checkpoints'>): number {
  let m = 0;
  for (const c of goal.checkpoints) {
    const w = c.weekOffset;
    if (typeof w === 'number' && Number.isFinite(w)) {
      m = Math.max(m, Math.round(w));
    }
  }
  return m;
}

function weeksFromMilestoneCadence(
  goal: Pick<Goal, 'checkpoints' | 'milestoneFrequency'>,
): number | null {
  const n = goal.checkpoints.length;
  if (n < 1) return null;
  const wo = maxCheckpointWeekOffset(goal);
  if (wo >= 1) return wo;
  const freq = goal.milestoneFrequency ?? 'weekly';
  const mult = freq === 'biweekly' ? 2 : freq === 'monthly' ? 4 : 1;
  return Math.max(1, n * mult);
}

/**
 * Planned time-bound length in whole weeks (minimum 1). Prefers calendar span from
 * `createdAtIso` → `targetDateIso`, then checkpoint week offsets / cadence, then weeks until deadline.
 */
export function computeGoalTimeBoundWeeks(
  goal: Pick<Goal, 'targetDateIso' | 'createdAtIso' | 'checkpoints' | 'milestoneFrequency'>,
): number {
  const deadline = parseIso(goal.targetDateIso);
  const created = parseIso(goal.createdAtIso);
  if (deadline && created) {
    const start = startOfLocalDay(created);
    const end = startOfLocalDay(deadline);
    if (end.getTime() >= start.getTime()) {
      return wholeWeeksFromStartToDeadline(start, end);
    }
  }
  const fromCadence = weeksFromMilestoneCadence(goal);
  if (fromCadence != null) return fromCadence;
  if (deadline) {
    const today = startOfLocalDay(new Date());
    return wholeWeeksFromStartToDeadline(today, deadline);
  }
  return Math.max(1, Math.ceil(daysUntilGoalDeadline(goal.targetDateIso) / 7));
}

function pointsPerWeekForGoalLength(totalWeeks: number): number {
  const w = Math.max(
    INTERPOLATE_WEEKS_MIN,
    Math.min(INTERPOLATE_WEEKS_MAX, totalWeeks),
  );
  const t = (w - INTERPOLATE_WEEKS_MIN) / (INTERPOLATE_WEEKS_MAX - INTERPOLATE_WEEKS_MIN);
  return Math.round(MIN_POINTS_PER_WEEK + t * (MAX_POINTS_PER_WEEK - MIN_POINTS_PER_WEEK));
}

/**
 * Full bar = (time-bound weeks) × (350–400 points/week depending on length).
 */
export function computeGoalBarTargetPoints(
  goal: Pick<Goal, 'targetDateIso' | 'createdAtIso' | 'checkpoints' | 'milestoneFrequency'>,
): number {
  const weeks = computeGoalTimeBoundWeeks(goal);
  const rate = pointsPerWeekForGoalLength(weeks);
  return weeks * rate;
}
