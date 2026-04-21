import type { Checkpoint, Quest } from '../types';

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

export function computeQuestRatio(
  dailyQuests: Quest[] | undefined,
  completed: Record<string, boolean>,
): number {
  const dailies = (dailyQuests ?? []).filter((q) => q.kind === 'daily');
  if (dailies.length === 0) return 0;
  const done = dailies.filter((q) => completed[q.id]).length;
  return done / dailies.length;
}

/** Segment used for quest partial stroke (same rules as the SVG). */
export function computeActiveSegment(
  slots: Checkpoint[],
  xs: number[],
  trackLeft: number,
): { x1: number; x2: number } | null {
  const n = slots.length;
  if (n < 1) return null;
  if (!slots[0].done) {
    return { x1: trackLeft, x2: xs[0] };
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (!(slots[i].done && slots[i + 1].done)) {
      return { x1: xs[i], x2: xs[i + 1] };
    }
  }
  return null;
}

/**
 * Rightmost x reached by combined checkpoint + quest fill (leading edge of progress).
 */
export function computeBarHeadX(
  slots: Checkpoint[],
  xs: number[],
  questRatio: number,
  trackLeft: number,
  trackEndX: number,
): number {
  const n = slots.length;
  if (n < 1) return trackLeft;
  if (!slots[0].done) {
    return trackLeft + questRatio * (xs[0] - trackLeft);
  }
  for (let i = 0; i < n - 1; i += 1) {
    if (!(slots[i].done && slots[i + 1].done)) {
      return xs[i] + questRatio * (xs[i + 1] - xs[i]);
    }
  }
  return trackEndX;
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
