import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import type { Quest } from '../types';
import type { ThemeColors } from '../theme/colors';
import { radius, spacing } from '../theme/spacing';

const RING_SIZE = 220;
const STROKE_PROGRESS = 12;
const STROKE_TRACK = 10;
const R = RING_SIZE / 2 - STROKE_PROGRESS / 2 - 4;
const CIRC = 2 * Math.PI * R;
const CENTER = RING_SIZE / 2;

type Props = {
  dailyQuests: Quest[];
  completed: Record<string, boolean>;
  streak: number;
  pointsToday: number;
  colors: ThemeColors;
};

function CircularProgressRing({
  progress,
  colors,
}: {
  progress: number;
  colors: ThemeColors;
}) {
  const p = Math.min(1, Math.max(0, progress));
  const offset = CIRC * (1 - p);

  return (
    <Svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}>
      <G transform={`rotate(-90 ${CENTER} ${CENTER})`}>
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={R}
          stroke={colors.border}
          strokeWidth={STROKE_TRACK}
          fill="none"
        />
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={R}
          stroke={colors.primary}
          strokeWidth={STROKE_PROGRESS}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${CIRC} ${CIRC}`}
          strokeDashoffset={offset}
        />
      </G>
    </Svg>
  );
}

export function DailyQuestProgressCard({
  dailyQuests,
  completed,
  streak,
  pointsToday,
  colors,
}: Props) {
  const total = dailyQuests.length;
  const done = dailyQuests.filter((q) => completed[q.id]).length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  const progress = total ? done / total : 0;
  const nextQuest = dailyQuests.find((q) => !completed[q.id]);

  const nextTitle = nextQuest
    ? nextQuest.title
    : 'All daily quests done';
  const nextPoints =
    nextQuest != null ? (
      <Text style={[styles.nextPoints, { color: colors.primary }]}>
        {` (+${nextQuest.points} pts)`}
      </Text>
    ) : null;

  const a11y = [
    `Daily progress ${percent} percent.`,
    `${done} of ${total} daily quests completed.`,
    nextQuest
      ? `Next: ${nextQuest.title}, ${nextQuest.points} points.`
      : 'All daily quests completed.',
    `${streak} day streak.`,
    `${pointsToday} points today.`,
  ].join(' ');

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
        },
      ]}
      accessibilityLabel={a11y}
    >
      <View style={styles.ringWrap}>
        <View
          style={[
            styles.glow,
            {
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
            },
          ]}
        />
        <CircularProgressRing progress={progress} colors={colors} />
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={[styles.percent, { color: colors.text }]}>{percent}%</Text>
          <View style={[styles.divider, { backgroundColor: colors.textSecondary }]} />
          <Text style={[styles.fraction, { color: colors.textSecondary }]}>
            {done} / {total}
          </Text>
        </View>
      </View>

      <View style={styles.nextBlock}>
        <Text style={[styles.nextLabel, { color: colors.textSecondary }]}>Next:</Text>
        <View style={styles.nextTitleRow}>
          <Text style={[styles.nextTitle, { color: colors.text }]} numberOfLines={2}>
            {nextTitle}
          </Text>
          {nextPoints}
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          🔥 {streak}-day streak
        </Text>
        <Text style={[styles.footerDot, { color: colors.textSecondary }]}> · </Text>
        <Text style={[styles.footerAccent, { color: colors.primary }]}>
          +{pointsToday} pts
        </Text>
        <Text style={[styles.footerToday, { color: colors.textSecondary }]}> today</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  ringWrap: {
    width: RING_SIZE + 32,
    height: RING_SIZE + 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: RING_SIZE + 48,
    height: RING_SIZE + 48,
    borderRadius: 9999,
    opacity: 0.12,
    shadowOpacity: 0.35,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  ringCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 4,
  },
  percent: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
  },
  divider: {
    width: 56,
    height: 1,
    opacity: 0.45,
    marginVertical: spacing.sm,
  },
  fraction: {
    fontSize: 16,
    fontWeight: '600',
  },
  nextBlock: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
  },
  nextLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  nextTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  nextTitle: {
    fontSize: 17,
    fontWeight: '700',
    flexShrink: 1,
  },
  nextPoints: {
    fontSize: 17,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  footerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  footerDot: {
    fontSize: 14,
  },
  footerAccent: {
    fontSize: 14,
    fontWeight: '700',
  },
  footerToday: {
    fontSize: 14,
    fontWeight: '500',
  },
});
