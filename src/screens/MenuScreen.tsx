import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { DailyQuestProgressCard } from '../components/DailyQuestProgressCard';
import { QuestRow } from '../components/QuestRow';
import { QuestSection } from '../components/QuestSection';
import { Screen } from '../components/Screen';
import { useActiveGoals } from '../context/ActiveGoalsContext';
import { useQuestProgress } from '../context/QuestProgressContext';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stableShuffle<T>(items: readonly T[], signature: string): T[] {
  const copy = [...items];
  const rand = mulberry32(hashString(signature));
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = t;
  }
  return copy;
}

export function MenuScreen() {
  const { colors } = useAppTheme();
  const { goals } = useActiveGoals();
  const {
    completed,
    toggleQuest,
    streak,
    pointsToday,
    dailyQuests,
    dailyQuestEntries,
    weeklyQuests,
  } = useQuestProgress();

  const shuffleKey = useMemo(() => {
    const ids = dailyQuestEntries.map((e) => e.quest.id);
    return [...new Set(ids)].sort().join(',');
  }, [dailyQuestEntries]);

  const shuffledDailyEntries = useMemo(
    () => stableShuffle(dailyQuestEntries, shuffleKey),
    [dailyQuestEntries, shuffleKey],
  );

  const awaitingAiQuests = useMemo(
    () => goals.some((g) => !g.completed && (g.dailyQuests?.length ?? 0) < 2),
    [goals],
  );

  const showDailyLoading = awaitingAiQuests && dailyQuestEntries.length === 0;

  return (
    <Screen>
      <DailyQuestProgressCard
        dailyQuests={dailyQuests}
        completed={completed}
        streak={streak}
        pointsToday={pointsToday}
        colors={colors}
      />

      <View style={styles.section}>
        <Text style={[styles.sectionHeading, { color: colors.text }]}>Daily quests</Text>
        {showDailyLoading ? (
          <Text style={[styles.loadingHint, { color: colors.textSecondary }]}>
            Generating quests…
          </Text>
        ) : null}
        {shuffledDailyEntries.map((entry) => (
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
  sectionHeading: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.md,
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
