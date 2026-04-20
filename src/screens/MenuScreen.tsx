import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../components/Screen';
import { QuestSection } from '../components/QuestSection';
import { mockDailyQuests, mockWeeklyQuests } from '../data/mockQuests';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

const allQuests = [...mockDailyQuests, ...mockWeeklyQuests];

function totalPointsForCompleted(
  completed: Record<string, boolean>,
): number {
  return allQuests.reduce((sum, q) => {
    if (completed[q.id]) return sum + q.points;
    return sum;
  }, 0);
}

export function MenuScreen() {
  const { colors } = useAppTheme();
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  const score = useMemo(
    () => totalPointsForCompleted(completed),
    [completed],
  );

  const toggle = (id: string) => {
    setCompleted((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Screen>
      <View
        style={[
          styles.scoreCard,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.scoreLabel, { color: colors.textSecondary }]}>
          Score
        </Text>
        <Text style={[styles.scoreValue, { color: colors.text }]}>{score}</Text>
        <Text style={[styles.scoreHint, { color: colors.textSecondary }]}>
          Points from completed quests update instantly.
        </Text>
      </View>

      <QuestSection
        title="Daily quests"
        quests={mockDailyQuests}
        completed={completed}
        onToggle={toggle}
      />
      <QuestSection
        title="Weekly quests"
        quests={mockWeeklyQuests}
        completed={completed}
        onToggle={toggle}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scoreCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  scoreLabel: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.xs,
  },
  scoreValue: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  scoreHint: {
    marginTop: spacing.sm,
    fontSize: 13,
    lineHeight: 18,
  },
});
