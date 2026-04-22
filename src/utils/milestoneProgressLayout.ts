import type { Checkpoint } from '../types';

export const MAX_VISIBLE_CHECKPOINTS = 12;
export const TRACK_LEFT = 2;
export const DOT_R = 5;
export const GOAL_R = 6.5;

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

/** Whether the bar has advanced to this milestone’s dot (touching the dot edge counts). */
export function isCheckpointUnlockedByBar(
  checkpoint: Checkpoint,
  checkpointIndex: number,
  layout: TrackLayout | null,
  headX: number,
): boolean {
  if (checkpoint.done) return true;
  if (!layout) return false;
  const x = layout.xs[checkpointIndex];
  if (x === undefined) return false;
  return headX >= x - DOT_R;
}

/**
 * The “current” milestone to work the bar toward: the first index, in order, where the
 * quest bar has not yet reached the checkpoint (or `null` if every checkpoint is
 * already bar-unlocked, e.g. all complete). When the bar has not been measured yet
 * (`layout` null), every incomplete checkpoint reads as not bar-unlocked, so this is 0.
 */
export function getCurrentMilestoneToReachIndex(
  checkpoints: Checkpoint[],
  layout: TrackLayout | null,
  headX: number,
): number | null {
  if (checkpoints.length === 0) return null;
  const idx = checkpoints.findIndex(
    (c, i) => !isCheckpointUnlockedByBar(c, i, layout, headX),
  );
  return idx === -1 ? null : idx;
}
