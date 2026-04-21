import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { DailyQuestDaySchedule } from '../components/DailyQuestDaySchedule';
import { Screen } from '../components/Screen';
import { useActiveGoals } from '../context/ActiveGoalsContext';
import { useQuestProgress } from '../context/QuestProgressContext';
import { useAppTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';
import {
  dailyQuestCountForPriority,
  parseGoalPriority,
} from '../utils/goalPriority';

/**
 * Tab dedicated to the draggable day timeline. CombatScreen remains in the codebase
 * but is not registered in the tab navigator.
 */
export function DayScheduleScreen() {
  const { colors, mode } = useAppTheme();
  const { goals, updateDailyQuestSchedule } = useActiveGoals();
  const { completed, dailyQuestEntries } = useQuestProgress();

  const awaitingAiQuests = useMemo(
    () =>
      goals.some((g) => {
        if (g.completed) return false;
        const expected = dailyQuestCountForPriority(parseGoalPriority(g.priority));
        return (g.dailyQuests?.length ?? 0) < expected;
      }),
    [goals],
  );

  const showDailyLoading = awaitingAiQuests && dailyQuestEntries.length === 0;

  return (
    <Screen>
      {showDailyLoading ? (
        <Text style={[styles.loadingHint, { color: colors.textSecondary }]}>
          Generating quests…
        </Text>
      ) : null}
      <DailyQuestDaySchedule
        entries={dailyQuestEntries}
        completed={completed}
        colors={colors}
        mode={mode}
        snapMinutes={15}
        onCommitSchedule={updateDailyQuestSchedule}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingHint: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.md,
  },
});
