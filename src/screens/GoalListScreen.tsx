import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GoalMilestoneProgress } from '../components/GoalMilestoneProgress';
import { Screen } from '../components/Screen';
import { useActiveGoals } from '../context/ActiveGoalsContext';
import { GoalsStackParamList } from '../navigation/goalsStackTypes';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import type { Goal, GoalPriority } from '../types';
import { parseGoalPriority } from '../utils/goalPriority';

type Nav = NativeStackNavigationProp<GoalsStackParamList, 'GoalList'>;

export function GoalListScreen() {
  const { colors } = useAppTheme();
  const navigation = useNavigation<Nav>();
  const { goals } = useActiveGoals();

  const prioritySections = useMemo(() => {
    const buckets: Record<GoalPriority, Goal[]> = {
      high: [],
      medium: [],
      low: [],
    };
    for (const g of goals) {
      buckets[parseGoalPriority(g.priority)].push(g);
    }
    const order: { key: GoalPriority; title: string }[] = [
      { key: 'high', title: 'High Priority' },
      { key: 'medium', title: 'Medium Priority' },
      { key: 'low', title: 'Low Priority' },
    ];
    return order
      .map((o) => ({ ...o, items: buckets[o.key] }))
      .filter((s) => s.items.length > 0);
  }, [goals]);

  return (
    <Screen>
      <Text style={[styles.heading, { color: colors.text }]}>Active goals</Text>
      {prioritySections.map((section, sectionIndex) => (
        <View key={section.key}>
          <Text
            style={[
              styles.sectionHeading,
              sectionIndex > 0 && styles.sectionHeadingAfterFirst,
              { color: colors.textSecondary },
            ]}
          >
            {section.title}
          </Text>
          {section.items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() =>
                navigation.navigate('GoalDetail', { goalId: item.id })
              }
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.border,
                },
                pressed && { opacity: 0.85 },
              ]}
            >
              <View style={styles.rowText}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {item.title}
                </Text>
                <Text
                  style={[styles.subtitle, { color: colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {item.description}
                </Text>
                {item.checkpoints.length > 0 ? (
                  <GoalMilestoneProgress
                    goal={item}
                    checkpoints={item.checkpoints}
                    dailyQuests={item.dailyQuests}
                  />
                ) : null}
              </View>
              <Text style={[styles.chevron, { color: colors.textSecondary }]}>
                ›
              </Text>
            </Pressable>
          ))}
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add goal"
        onPress={() => navigation.navigate('AddGoal')}
        style={({ pressed }) => [
          styles.addGoalButton,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
        <Text style={[styles.addGoalLabel, { color: colors.primary }]}>
          Add goal
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  sectionHeadingAfterFirst: {
    marginTop: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  chevron: {
    fontSize: 22,
    fontWeight: '300',
  },
  addGoalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  addGoalLabel: {
    fontSize: 17,
    fontWeight: '700',
  },
});
