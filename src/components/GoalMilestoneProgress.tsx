import { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { useQuestProgress } from '../context/QuestProgressContext';
import { useAppTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';
import type { Checkpoint, Goal } from '../types';
import { computeGoalBarTargetPoints } from '../utils/goalBarTargetPoints';
import {
  computeBarHeadX,
  computePointsBarFraction,
  computeTrackLayout,
  DOT_R,
  GOAL_R,
  TRACK_LEFT,
  visibleCheckpointIndices,
} from '../utils/milestoneProgressLayout';

const ROW_HEIGHT = 22;
const TRACK_STROKE = 2;

type Props = {
  goal: Pick<Goal, 'id' | 'targetDateIso' | 'createdAtIso' | 'checkpoints' | 'milestoneFrequency'>;
  checkpoints: Checkpoint[];
  /** Kept for API compatibility; bar fill uses persisted goal bar points. */
  dailyQuests?: unknown;
  /** When false, every checkpoint gets a dot (matches a full milestone list). Default true. */
  subsampling?: boolean;
  /** Fires with the measured inner track width (for unlock math on other screens). */
  onTrackWidthChange?: (width: number) => void;
};

export function GoalMilestoneProgress({
  goal,
  checkpoints,
  dailyQuests: _dailyQuests,
  subsampling = true,
  onTrackWidthChange,
}: Props) {
  const { colors } = useAppTheme();
  const { goalBarEarned } = useQuestProgress();
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

  const earned = goalBarEarned[goal.id] ?? 0;
  const targetPoints = useMemo(
    () => computeGoalBarTargetPoints(goal),
    [goal.targetDateIso, goal.createdAtIso, goal.milestoneFrequency, goal.checkpoints],
  );
  const pointsFraction = useMemo(
    () => computePointsBarFraction(earned, targetPoints),
    [earned, targetPoints],
  );

  const layout = useMemo(
    () => computeTrackLayout(trackWidth, n),
    [trackWidth, n],
  );

  const headX = useMemo(() => {
    if (!layout) return TRACK_LEFT;
    return computeBarHeadX(pointsFraction, layout.trackStartX, layout.trackEndX);
  }, [layout, pointsFraction]);

  if (total === 0) {
    return null;
  }

  const completedCp = checkpoints.filter((c) => c.done).length;
  const earnedDisplay = Math.round(earned * 10) / 10;

  const a11yPoints = ` Progress bar: ${earnedDisplay} of ${targetPoints} quest points.`;
  const a11yMilestones = ` Milestones: ${completedCp} of ${total} complete.`;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${a11yPoints}${a11yMilestones}`}
    >
      <View style={styles.trackWrap} onLayout={onTrackLayout}>
        {layout && (
          <Svg width={trackWidth} height={ROW_HEIGHT}>
            <Line
              x1={layout.trackStartX}
              y1={cy}
              x2={layout.trackEndX}
              y2={cy}
              stroke={colors.border}
              strokeWidth={TRACK_STROKE}
            />

            {pointsFraction > 0 && (
              <Line
                x1={layout.trackStartX}
                y1={cy}
                x2={headX}
                y2={cy}
                stroke={colors.primary}
                strokeWidth={TRACK_STROKE}
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
        {earnedDisplay}/{targetPoints}
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
