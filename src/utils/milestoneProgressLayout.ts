import type { Checkpoint, Goal } from '../types';

import { computeGoalBarTargetPoints } from './goalBarTargetPoints';

export const MAX_VISIBLE_CHECKPOINTS = 12;
export const TRACK_LEFT = 2;
export const DOT_R = 5;
export const GOAL_R = 6.5;

/**
 * Fixed width for bar-unlock math when no screen layout is available (e.g. quest
 * complete handler). Slightly different from on-device `trackWidth` is acceptable
 * (same formulas as the visible bar).
 */
export const REFERENCE_TRACK_WIDTH = 320;

/** Indices of checkpoints shown on the bar when there are many milestones. */
export function visibleCheckpointIndices(
  total: number,
  maxVisible = MAX_VISIBLE_CHECKPOINTS,
): number[] {
  if (total <= 0) return [];
  if (total <= maxVisible) {
    return Array.from({ length: total }, (_, i) => i);
  }
  return Array.from({ length: maxVisible }, (_, k) =>
    Math.round((k * (total - 1)) / (maxVisible - 1)),
  );
}

export type TrackLayout = {
  firstDotX: number;
  lastDotX: number;
  xs: number[];
  trackEndX: number;
};

/** Horizontal positions of milestone dots for `n` checkpoints on a track of `trackWidth`. */
export function computeTrackLayout(
  trackWidth: number,
  n: number,
): TrackLayout | null {
  if (trackWidth <= 0 || n < 1) return null;
  const rightPad = GOAL_R + 3;
  const lastDotX = Math.max(TRACK_LEFT + GOAL_R + 4, trackWidth - rightPad);
  const leadMin = Math.min(14, Math.max(10, trackWidth * 0.06));
  const firstDotX = Math.max(
    TRACK_LEFT + 8,
    Math.min(lastDotX - 4, TRACK_LEFT + leadMin),
  );

  const xs = Array.from({ length: n }, (_, i) => {
    if (n <= 1) return lastDotX;
    return firstDotX + (i / (n - 1)) * (lastDotX - firstDotX);
  });

  return {
    firstDotX,
    lastDotX,
    xs,
    trackEndX: lastDotX,
  };
}

export function computePointsBarFraction(
  earned: number,
  targetPoints: number,
): number {
  if (targetPoints <= 0) return 0;
  return Math.min(1, earned / targetPoints);
}

/** Leading edge of progress from points earned / target (0–1 along full track). */
export function computeBarHeadX(
  pointsFraction: number,
  trackLeft: number,
  trackEndX: number,
): number {
  const f = Math.max(0, Math.min(1, pointsFraction));
  return trackLeft + f * (trackEndX - trackLeft);
}

/**
 * Whether the progress bar head has reached this milestone’s dot (touching the dot edge counts).
 * Ignores `checkpoint.done`; use that separately for completion UI.
 */
export function isCheckpointReachedByBarGeometry(
  _checkpoint: Checkpoint,
  checkpointIndex: number,
  layout: TrackLayout | null,
  headX: number,
): boolean {
  if (!layout) return false;
  const x = layout.xs[checkpointIndex];
  if (x === undefined) return false;
  return headX >= x - DOT_R;
}

/** Whether the milestone is complete or the bar head has reached its dot (legacy combined check). */
export function isCheckpointUnlockedByBar(
  checkpoint: Checkpoint,
  checkpointIndex: number,
  layout: TrackLayout | null,
  headX: number,
): boolean {
  if (checkpoint.done) return true;
  return isCheckpointReachedByBarGeometry(checkpoint, checkpointIndex, layout, headX);
}

/**
 * The next milestone in order that is not yet marked complete (`done`), or `null` if all are
 * complete. `layout` / `headX` are unused but kept for call-site stability.
 */
export function getCurrentMilestoneToReachIndex(
  checkpoints: Checkpoint[],
  _layout: TrackLayout | null,
  _headX: number,
): number | null {
  void _layout;
  void _headX;
  if (checkpoints.length === 0) return null;
  const idx = checkpoints.findIndex((c) => !c.done);
  return idx === -1 ? null : idx;
}

/**
 * Whether quest points place the bar head at or past this milestone’s dot (or the checkpoint
 * is already done). Uses `REFERENCE_TRACK_WIDTH` and `isCheckpointReachedByBarGeometry`.
 */
export function isMilestoneUnlockedByPoints(
  earned: number,
  targetPoints: number,
  checkpoint: Checkpoint,
  checkpointIndex: number,
  totalCheckpoints: number,
): boolean {
  if (checkpoint.done) return true;
  if (totalCheckpoints < 1) return false;
  const layout = computeTrackLayout(REFERENCE_TRACK_WIDTH, totalCheckpoints);
  if (!layout) return false;
  const frac = computePointsBarFraction(earned, targetPoints);
  const headX = computeBarHeadX(frac, TRACK_LEFT, layout.trackEndX);
  return isCheckpointReachedByBarGeometry(checkpoint, checkpointIndex, layout, headX);
}

/**
 * Indices of incomplete, revealed milestones whose bar head crosses from before to at/after
 * their dot as points go from `earnedBefore` to `earnedAfter` (larger), in ascending order.
 * Skips `revealed: false` (legacy pre-title unlock).
 */
export function getNewlyUnlockedMilestoneIndices(
  goal: Pick<Goal, 'checkpoints' | 'targetDateIso'>,
  earnedBefore: number,
  earnedAfter: number,
): number[] {
  if (earnedAfter <= earnedBefore) return [];
  const n = goal.checkpoints.length;
  if (n < 1) return [];
  const target = computeGoalBarTargetPoints(goal);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = goal.checkpoints[i];
    if (c.done) continue;
    if (c.revealed === false) continue;
    const before = isMilestoneUnlockedByPoints(earnedBefore, target, c, i, n);
    const after = isMilestoneUnlockedByPoints(earnedAfter, target, c, i, n);
    if (!before && after) {
      out.push(i);
    }
  }
  return out;
}
