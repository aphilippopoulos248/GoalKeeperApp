import { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { useQuestProgress } from '../context/QuestProgressContext';
import { useAppTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';
import type { Checkpoint, Quest } from '../types';

const MAX_VISIBLE = 12;
const ROW_HEIGHT = 22;
const DOT_R = 5;
const GOAL_R = 6.5;
const TRACK_STROKE = 2;
const QUEST_STROKE = 1.5;
const TRACK_LEFT = 2;

function visibleCheckpointIndices(total: number): number[] {
  if (total <= 0) return [];
  if (total <= MAX_VISIBLE) {
    return Array.from({ length: total }, (_, i) => i);
  }
  return Array.from({ length: MAX_VISIBLE }, (_, k) =>
    Math.round((k * (total - 1)) / (MAX_VISIBLE - 1)),
  );
}

type Props = {
  /** Passed for call-site consistency; milestone math uses `checkpoints` and `dailyQuests`. */
  goalId: string;
  checkpoints: Checkpoint[];
  dailyQuests?: Quest[];
};

export function GoalMilestoneProgress({
  goalId: _goalId,
  checkpoints,
  dailyQuests,
}: Props) {
  const { colors } = useAppTheme();
  const { completed } = useQuestProgress();
  const [trackWidth, setTrackWidth] = useState(0);

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const total = checkpoints.length;
  const indices = visibleCheckpointIndices(total);
  const slots = indices.map((idx) => checkpoints[idx]);
  const n = slots.length;
  const cy = ROW_HEIGHT / 2;

  const dailies = useMemo(
    () => (dailyQuests ?? []).filter((q) => q.kind === 'daily'),
    [dailyQuests],
  );
  const questTotal = dailies.length;
  const questDone = useMemo(
    () => dailies.filter((q) => completed[q.id]).length,
    [dailies, completed],
  );
  const questRatio = questTotal > 0 ? questDone / questTotal : 0;

  const layout = useMemo(() => {
    if (trackWidth <= 0 || n < 1) return null;
    const rightPad = GOAL_R + 3;
    const lastDotX = Math.max(TRACK_LEFT + GOAL_R + 4, trackWidth - rightPad);
    const leadMin = Math.min(14, Math.max(10, trackWidth * 0.06));
    const firstDotX = Math.max(
      TRACK_LEFT + 8,
      Math.min(lastDotX - 4, TRACK_LEFT + leadMin),
    );

    const dotX = (i: number): number => {
      if (n <= 1) return lastDotX;
      return firstDotX + (i / (n - 1)) * (lastDotX - firstDotX);
    };

    const xs = Array.from({ length: n }, (_, i) => dotX(i));
    return { lastDotX, firstDotX, dotX, xs, trackEndX: lastDotX };
  }, [trackWidth, n]);

  const activeSegment = useMemo(() => {
    if (!layout || n < 1) return null;
    const { xs, trackEndX } = layout;
    if (!slots[0].done) {
      return { x1: TRACK_LEFT, x2: xs[0] };
    }
    for (let i = 0; i < n - 1; i += 1) {
      if (!(slots[i].done && slots[i + 1].done)) {
        return { x1: xs[i], x2: xs[i + 1] };
      }
    }
    return null;
  }, [layout, n, slots]);

  if (total === 0) {
    return null;
  }

  const completedCp = checkpoints.filter((c) => c.done).length;

  const a11yQuest =
    questTotal > 0
      ? ` Daily quests for this goal: ${questDone} of ${questTotal} complete.`
      : '';

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Milestones: ${completedCp} of ${total} complete.${a11yQuest}`}
    >
      <View style={styles.trackWrap} onLayout={onTrackLayout}>
        {layout && (
          <Svg width={trackWidth} height={ROW_HEIGHT}>
            <Line
              x1={TRACK_LEFT}
              y1={cy}
              x2={layout.trackEndX}
              y2={cy}
              stroke={colors.border}
              strokeWidth={TRACK_STROKE}
            />

            {slots[0].done && (
              <Line
                x1={TRACK_LEFT}
                y1={cy}
                x2={layout.xs[0]}
                y2={cy}
                stroke={colors.primary}
                strokeWidth={TRACK_STROKE}
              />
            )}
            {slots.map((slot, i) => {
              if (i >= n - 1) return null;
              const next = slots[i + 1];
              if (!slot.done || !next.done) return null;
              return (
                <Line
                  key={`cp-seg-${i}`}
                  x1={layout.xs[i]}
                  y1={cy}
                  x2={layout.xs[i + 1]}
                  y2={cy}
                  stroke={colors.primary}
                  strokeWidth={TRACK_STROKE}
                />
              );
            })}

            {activeSegment && questRatio > 0 && (
              <Line
                x1={activeSegment.x1}
                y1={cy}
                x2={
                  activeSegment.x1 +
                  questRatio * (activeSegment.x2 - activeSegment.x1)
                }
                y2={cy}
                stroke={colors.primary}
                strokeWidth={QUEST_STROKE}
                strokeOpacity={0.85}
                strokeLinecap="round"
              />
            )}

            {slots.map((slot, i) => {
              const cx = layout.xs[i];
              const isGoal = indices[i] === total - 1;
              if (isGoal) {
                return (
                  <Circle
                    key={`dot-${i}`}
                    cx={cx}
                    cy={cy}
                    r={GOAL_R}
                    fill="none"
                    stroke={slot.done ? colors.primary : colors.border}
                    strokeWidth={2}
                  />
                );
              }
              return (
                <Circle
                  key={`dot-${i}`}
                  cx={cx}
                  cy={cy}
                  r={DOT_R}
                  fill={slot.done ? colors.primary : colors.border}
                />
              );
            })}
          </Svg>
        )}
      </View>
      <Text
        style={[styles.fraction, { color: colors.textSecondary }]}
        importantForAccessibility="no"
      >
        {completedCp} / {total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  trackWrap: {
    flex: 1,
    minHeight: ROW_HEIGHT,
    justifyContent: 'center',
  },
  fraction: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 52,
    textAlign: 'right',
  },
});
