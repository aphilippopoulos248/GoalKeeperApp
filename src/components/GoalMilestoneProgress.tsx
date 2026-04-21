import { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { useQuestProgress } from '../context/QuestProgressContext';
import { useAppTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';
import type { Checkpoint, Quest } from '../types';
import {
  computeActiveSegment,
  computeQuestRatio,
  computeTrackLayout,
  DOT_R,
  GOAL_R,
  TRACK_LEFT,
  visibleCheckpointIndices,
} from '../utils/milestoneProgressLayout';

const ROW_HEIGHT = 22;
const TRACK_STROKE = 2;
const QUEST_STROKE = 1.5;

type Props = {
  /** Passed for call-site consistency; milestone math uses `checkpoints` and `dailyQuests`. */
  goalId: string;
  checkpoints: Checkpoint[];
  dailyQuests?: Quest[];
  /** When false, every checkpoint gets a dot (matches a full milestone list). Default true. */
  subsampling?: boolean;
  /** Fires with the measured inner track width (for unlock math on other screens). */
  onTrackWidthChange?: (width: number) => void;
};

export function GoalMilestoneProgress({
  goalId: _goalId,
  checkpoints,
  dailyQuests,
  subsampling = true,
  onTrackWidthChange,
}: Props) {
  const { colors } = useAppTheme();
  const { completed } = useQuestProgress();
  const [trackWidth, setTrackWidth] = useState(0);

  const onTrackLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = e.nativeEvent.layout.width;
      setTrackWidth(w);
      onTrackWidthChange?.(w);
    },
    [onTrackWidthChange],
  );

  const total = checkpoints.length;
  const indices = useMemo(() => {
    if (!subsampling) {
      return Array.from({ length: total }, (_, i) => i);
    }
    return visibleCheckpointIndices(total);
  }, [subsampling, total]);
  const slots = indices.map((idx) => checkpoints[idx]);
  const n = slots.length;
  const cy = ROW_HEIGHT / 2;

  const questRatio = useMemo(
    () => computeQuestRatio(dailyQuests, completed),
    [dailyQuests, completed],
  );
  const questTotal = useMemo(
    () => (dailyQuests ?? []).filter((q) => q.kind === 'daily').length,
    [dailyQuests],
  );
  const questDone = useMemo(() => {
    const dailies = (dailyQuests ?? []).filter((q) => q.kind === 'daily');
    return dailies.filter((q) => completed[q.id]).length;
  }, [dailyQuests, completed]);

  const layout = useMemo(
    () => computeTrackLayout(trackWidth, n),
    [trackWidth, n],
  );

  const activeSegment = useMemo(() => {
    if (!layout) return null;
    return computeActiveSegment(slots, layout.xs, TRACK_LEFT);
  }, [layout, slots]);

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
