import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import type { Goal } from '../types';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import { stripTimeBoundDisplay } from '../utils/smartDisplay';

const PAGES = [
  { letter: 'S', label: 'Specific', accent: '#3b82f6', icon: 'locate' as const },
  { letter: 'M', label: 'Measurable', accent: '#22c55e', icon: 'stats-chart' as const },
  { letter: 'A', label: 'Achievable', accent: '#a855f7', icon: 'barbell' as const },
  { letter: 'R', label: 'Relevant', accent: '#f97316', icon: 'star' as const },
  { letter: 'T', label: 'Time-bound', accent: '#ef4444', icon: 'calendar' as const },
];

type Props = {
  goal: Pick<Goal, 'specific' | 'measurable' | 'achievable' | 'relevant' | 'timeBound'>;
};

export function GoalSmartPager({ goal }: Props) {
  const { colors } = useAppTheme();
  const { width: winW } = useWindowDimensions();
  const pageWidth = winW - 2 * spacing.md;
  const [page, setPage] = useState(0);

  const bodies = [
    goal.specific,
    goal.measurable,
    goal.achievable,
    goal.relevant,
    stripTimeBoundDisplay(goal.timeBound),
  ];

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    setPage(Math.min(PAGES.length - 1, Math.max(0, Math.round(x / pageWidth))));
  };

  return (
    <View style={styles.wrap}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>SMART Goal</Text>
      <View style={styles.dots}>
        {PAGES.map((p, i) => (
          <View
            key={p.letter}
            style={[
              styles.dot,
              { backgroundColor: i === page ? p.accent : colors.border },
            ]}
          />
        ))}
      </View>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumEnd}
        style={{ width: pageWidth }}
        contentContainerStyle={{ width: pageWidth * PAGES.length }}
      >
        {PAGES.map((meta, i) => (
          <View key={meta.letter} style={[styles.page, { width: pageWidth }]}>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: meta.accent,
                },
              ]}
            >
              <Text style={[styles.bigLetter, { color: meta.accent }]}>{meta.letter}</Text>
              <Text style={[styles.label, { color: meta.accent }]}>{meta.label}</Text>
              <View style={[styles.divider, { backgroundColor: meta.accent }]} />
              <View style={[styles.iconRing, { borderColor: meta.accent }]}>
                <Ionicons name={meta.icon} size={28} color={meta.accent} />
              </View>
              <Text style={[styles.body, { color: colors.text }]}>{bodies[i]}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.hintRow}>
        <Ionicons name="hand-left" size={18} color={colors.textSecondary} />
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Swipe to explore each part of your SMART goal.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  page: {
    paddingVertical: 0,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    minHeight: 280,
    alignItems: 'center',
  },
  bigLetter: {
    fontSize: 48,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  divider: {
    width: 40,
    height: 2,
    borderRadius: 1,
    marginBottom: spacing.md,
  },
  iconRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  hint: {
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
    textAlign: 'center',
  },
});
