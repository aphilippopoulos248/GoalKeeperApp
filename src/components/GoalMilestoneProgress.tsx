import { useCallback, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { useAppTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';
import type { Checkpoint } from '../types';

const MAX_VISIBLE = 12;
const ROW_HEIGHT = 22;
const DOT_R = 5;
const TRACK_STROKE = 2;

function visibleCheckpointIndices(total: number): number[] {
  if (total <= 0) return [];
  if (total <= MAX_VISIBLE) {
    return Array.from({ length: total }, (_, i) => i);
  }
  return Array.from({ length: MAX_VISIBLE }, (_, k) =>
    Math.round((k * (total - 1)) / (MAX_VISIBLE - 1)),
  );
}

function milestoneX(i: number, slotCount: number, width: number): number {
  const pad = DOT_R + 2;
  if (slotCount <= 1) {
    return width / 2;
  }
  const usable = Math.max(0, width - 2 * pad);
  return pad + (i / (slotCount - 1)) * usable;
}

type Props = {
  checkpoints: Checkpoint[];
};

export function GoalMilestoneProgress({ checkpoints }: Props) {
  const { colors } = useAppTheme();
  const [trackWidth, setTrackWidth] = useState(0);

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    setTrackWidth(e.nativeEvent.layout.width);
  }, []);

  const total = checkpoints.length;
  if (total === 0) {
    return null;
  }

  const completed = checkpoints.filter((c) => c.done).length;
  const indices = visibleCheckpointIndices(total);
  const slots = indices.map((idx) => checkpoints[idx]);
  const n = slots.length;
  const cy = ROW_HEIGHT / 2;

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Milestones: ${completed} of ${total} complete`}
    >
      <View style={styles.trackWrap} onLayout={onTrackLayout}>
        {trackWidth > 0 && (
          <Svg width={trackWidth} height={ROW_HEIGHT}>
            {n >= 2 && (
              <Line
                x1={milestoneX(0, n, trackWidth)}
                y1={cy}
                x2={milestoneX(n - 1, n, trackWidth)}
                y2={cy}
                stroke={colors.border}
                strokeWidth={TRACK_STROKE}
              />
            )}
            {n === 1 && (
              <Line
                x1={milestoneX(0, 1, trackWidth) - DOT_R}
                y1={cy}
                x2={milestoneX(0, 1, trackWidth) + DOT_R}
                y2={cy}
                stroke={colors.border}
                strokeWidth={TRACK_STROKE}
              />
            )}
            {slots.map((slot, i) => {
              if (i >= n - 1) return null;
              const next = slots[i + 1];
              if (!slot.done || !next.done) return null;
              const x1 = milestoneX(i, n, trackWidth);
              const x2 = milestoneX(i + 1, n, trackWidth);
              return (
                <Line
                  key={`seg-${i}`}
                  x1={x1}
                  y1={cy}
                  x2={x2}
                  y2={cy}
                  stroke={colors.primary}
                  strokeWidth={TRACK_STROKE}
                />
              );
            })}
            {slots.map((slot, i) => {
              const cx = milestoneX(i, n, trackWidth);
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
        {completed} / {total}
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
