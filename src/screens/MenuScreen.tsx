import { Picker } from '@react-native-picker/picker';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { DailyQuestProgressCard } from '../components/DailyQuestProgressCard';
import { QuestRow } from '../components/QuestRow';
import { QuestSection } from '../components/QuestSection';
import { Screen } from '../components/Screen';
import { useActiveGoals } from '../context/ActiveGoalsContext';
import {
  DailyQuestEntry,
  useQuestProgress,
} from '../context/QuestProgressContext';
import type { GoalPriority } from '../types';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import {
  dailyQuestCountForPriority,
  parseGoalPriority,
} from '../utils/goalPriority';

type DailyQuestSortMode = 'recommended' | 'goal' | 'priority';

function dayOrderValue(quest: DailyQuestEntry['quest']): number {
  return typeof quest.dayOrder === 'number' && Number.isFinite(quest.dayOrder)
    ? quest.dayOrder
    : 500;
}

function prioritySortRank(p: GoalPriority): number {
  switch (p) {
    case 'high':
      return 0;
    case 'medium':
      return 1;
    case 'low':
      return 2;
    default:
      return 1;
  }
}

export function MenuScreen() {
  const { colors } = useAppTheme();
  const { goals } = useActiveGoals();
  const [sortMode, setSortMode] = useState<DailyQuestSortMode>('recommended');
  const {
    completed,
    toggleQuest,
    streak,
    pointsToday,
    dailyQuestEntries,
    weeklyQuests,
  } = useQuestProgress();

  const activeGoals = useMemo(
    () => goals.filter((g) => !g.completed),
    [goals],
  );

  const goalMeta = useMemo(() => {
    const m = new Map<string, { index: number; priority: GoalPriority }>();
    activeGoals.forEach((g, i) => {
      m.set(g.id, { index: i, priority: parseGoalPriority(g.priority) });
    });
    return m;
  }, [activeGoals]);

  const displayedDailyQuestEntries = useMemo((): DailyQuestEntry[] => {
    if (sortMode === 'recommended') {
      return dailyQuestEntries;
    }
    const copy = [...dailyQuestEntries];
    const metaFor = (goalId: string) =>
      goalMeta.get(goalId) ?? { index: 999, priority: 'medium' as GoalPriority };

    if (sortMode === 'goal') {
      copy.sort((a, b) => {
        const ai = metaFor(a.goalId).index;
        const bi = metaFor(b.goalId).index;
        if (ai !== bi) return ai - bi;
        const d = dayOrderValue(a.quest) - dayOrderValue(b.quest);
        if (d !== 0) return d;
        return a.quest.id.localeCompare(b.quest.id);
      });
      return copy;
    }

    copy.sort((a, b) => {
      const am = metaFor(a.goalId);
      const bm = metaFor(b.goalId);
      const pr = prioritySortRank(am.priority) - prioritySortRank(bm.priority);
      if (pr !== 0) return pr;
      if (am.index !== bm.index) return am.index - bm.index;
      const d = dayOrderValue(a.quest) - dayOrderValue(b.quest);
      if (d !== 0) return d;
      return a.quest.id.localeCompare(b.quest.id);
    });
    return copy;
  }, [dailyQuestEntries, goalMeta, sortMode]);

  const displayedDailyQuests = useMemo(
    () => displayedDailyQuestEntries.map((e) => e.quest),
    [displayedDailyQuestEntries],
  );

  const awaitingAiQuests = useMemo(
    () =>
      goals.some((g) => {
        if (g.completed) return false;
        const expected = dailyQuestCountForPriority(g.priority ?? 'medium');
        return (g.dailyQuests?.length ?? 0) < expected;
      }),
    [goals],
  );

  const showDailyLoading = awaitingAiQuests && dailyQuestEntries.length === 0;

  return (
    <Screen>
      <DailyQuestProgressCard
        dailyQuests={displayedDailyQuests}
        completed={completed}
        streak={streak}
        pointsToday={pointsToday}
        colors={colors}
      />

      <View style={styles.section}>
        <View style={styles.dailyHeaderRow}>
          <Text style={[styles.sectionHeading, { color: colors.text }]}>
            Daily quests
          </Text>
          <View
            style={[
              styles.sortPickerWrap,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
              },
            ]}
          >
            <Picker
              accessibilityLabel="Sort daily quests"
              selectedValue={sortMode}
              onValueChange={(v) => setSortMode(v as DailyQuestSortMode)}
              style={[styles.sortPicker, { color: colors.text }]}
              mode={Platform.OS === 'android' ? 'dropdown' : undefined}
              dropdownIconColor={colors.textSecondary}
            >
              <Picker.Item
                label="Recommended"
                value="recommended"
                color={colors.text}
              />
              <Picker.Item label="Goal" value="goal" color={colors.text} />
              <Picker.Item
                label="Priority"
                value="priority"
                color={colors.text}
              />
            </Picker>
          </View>
        </View>
        {showDailyLoading ? (
          <Text style={[styles.loadingHint, { color: colors.textSecondary }]}>
            Generating quests…
          </Text>
        ) : null}
        {displayedDailyQuestEntries.map((entry) => (
          <View
            key={entry.quest.id}
            style={[
              styles.questCard,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
                ...Platform.select({
                  ios: {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.06,
                    shadowRadius: 3,
                  },
                  android: { elevation: 2 },
                  default: {},
                }),
              },
            ]}
          >
            <View
              style={[
                styles.questCardHeader,
                {
                  backgroundColor: colors.surface,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <Text
                style={[styles.questCardHeaderText, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {entry.goalTitle}
              </Text>
            </View>
            <QuestRow
              variant="inCard"
              quest={entry.quest}
              completed={!!completed[entry.quest.id]}
              onToggle={() => toggleQuest(entry.quest.id)}
            />
          </View>
        ))}
      </View>

      <QuestSection
        title="Weekly quests"
        quests={weeklyQuests}
        completed={completed}
        onToggle={toggleQuest}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  dailyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionHeading: {
    flex: 1,
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '700',
  },
  sortPickerWrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    minWidth: 148,
    overflow: 'hidden',
  },
  sortPicker: {
    width: '100%',
    marginVertical: -4,
  },
  loadingHint: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.md,
  },
  questCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  questCardHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  questCardHeaderText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
});
