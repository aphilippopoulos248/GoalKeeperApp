import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { GoalMilestoneProgress } from '../components/GoalMilestoneProgress';
import { Screen } from '../components/Screen';
import { useActiveGoals } from '../context/ActiveGoalsContext';
import { useQuestProgress } from '../context/QuestProgressContext';
import { GoalsStackParamList } from '../navigation/goalsStackTypes';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import { computeGoalBarTargetPoints } from '../utils/goalBarTargetPoints';
import {
  computeBarHeadX,
  computePointsBarFraction,
  computeTrackLayout,
  isCheckpointUnlockedByBar,
  TRACK_LEFT,
} from '../utils/milestoneProgressLayout';

type Props = NativeStackScreenProps<GoalsStackParamList, 'GoalDetail'>;

export function GoalDetailScreen({ route, navigation }: Props) {
  const { colors } = useAppTheme();
  const { getGoalById, removeGoal, toggleCheckpoint } = useActiveGoals();
  const { goalBarEarned } = useQuestProgress();
  const [trackWidth, setTrackWidth] = useState(0);
  const g = getGoalById(route.params.goalId);

  useEffect(() => {
    setTrackWidth(0);
  }, [route.params.goalId]);

  const layout = useMemo(
    () =>
      g && g.checkpoints.length > 0
        ? computeTrackLayout(trackWidth, g.checkpoints.length)
        : null,
    [g, trackWidth],
  );

  const targetPoints = useMemo(
    () => (g ? computeGoalBarTargetPoints(g) : 0),
    [g],
  );

  const pointsFraction = useMemo(() => {
    if (!g) return 0;
    const earned = goalBarEarned[g.id] ?? 0;
    return computePointsBarFraction(earned, targetPoints);
  }, [g, goalBarEarned, targetPoints]);

  const headX = useMemo(() => {
    if (!layout) return 0;
    return computeBarHeadX(pointsFraction, TRACK_LEFT, layout.trackEndX);
  }, [layout, pointsFraction]);

  if (!g) {
    return (
      <Screen>
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backRow, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>
            Back to goals
          </Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>
          Goal not found
        </Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Pressable
        onPress={() => navigation.goBack()}
        style={({ pressed }) => [styles.backRow, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="chevron-back" size={22} color={colors.primary} />
        <Text style={[styles.backText, { color: colors.primary }]}>
          Back to goals
        </Text>
      </Pressable>

      <Text style={[styles.title, { color: colors.text }]}>{g.title}</Text>
      <Text style={[styles.body, { color: colors.textSecondary }]}>
        {g.description}
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.surfaceElevated, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.text }]}>SMART</Text>
        <SmartRow label="Specific" value={g.specific} />
        <SmartRow label="Measurable" value={g.measurable} />
        <SmartRow label="Achievable" value={g.achievable} />
        <SmartRow label="Relevant" value={g.relevant} />
        <SmartRow label="Time-bound" value={g.timeBound} />
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>
        Milestones
      </Text>
      {g.checkpoints.length === 0 ? (
        <Text style={[styles.emptyCheckpoints, { color: colors.textSecondary }]}>
          No checkpoints yet.
        </Text>
      ) : (
        <>
          <GoalMilestoneProgress
            goal={g}
            checkpoints={g.checkpoints}
            dailyQuests={g.dailyQuests}
            subsampling={false}
            onTrackWidthChange={setTrackWidth}
          />
          {g.checkpoints.map((c, i) => {
            const unlocked = isCheckpointUnlockedByBar(c, i, layout, headX);
            const lockedLabel = `Checkpoint: ${c.title}. Locked. Complete daily quests to earn points; when the bar reaches this milestone, you can tap to complete it.`;
            const openLabel = `Checkpoint: ${c.title}. ${c.done ? 'Completed' : 'Not completed'}. Tap to toggle.`;

            return unlocked ? (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={openLabel}
                onPress={() => toggleCheckpoint(g.id, c.id)}
                style={({ pressed }) => [
                  styles.checkpoint,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                  pressed && { opacity: 0.88 },
                ]}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: c.done ? colors.success : colors.border,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.checkpointText,
                    { color: c.done ? colors.text : colors.textSecondary },
                  ]}
                >
                  {c.title}
                </Text>
              </Pressable>
            ) : (
              <View
                key={c.id}
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                accessibilityLabel={lockedLabel}
                style={[styles.checkpoint, styles.checkpointLocked, {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }]}
              >
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: colors.border },
                  ]}
                />
                <Text
                  style={[styles.checkpointText, { color: colors.textSecondary }]}
                >
                  {c.title}
                </Text>
                <Text style={[styles.lockedHint, { color: colors.textSecondary }]}>
                  Locked
                </Text>
                <Ionicons
                  name="lock-closed"
                  size={18}
                  color={colors.textSecondary}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              </View>
            );
          })}
        </>
      )}

      <View
        style={[
          styles.aiCard,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.primaryMuted,
          },
        ]}
      >
        <Text style={[styles.aiTitle, { color: colors.text }]}>AI assist</Text>
        <Text style={[styles.aiBody, { color: colors.textSecondary }]}>
          {g.dailyQuests != null && g.dailyQuests.length > 0
            ? 'The Menu tab lists daily quests for every active goal (in random order). Yours include two AI quests for this goal. Completing checkpoints here refreshes this goal’s pair with higher difficulty as you progress.'
            : 'Add a goal with AI to fill SMART fields, checkpoints, and daily quests automatically, or wait while the app generates quests for goals that do not have them yet.'}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Remove this goal"
        onPress={() =>
          Alert.alert(
            '',
            'Are you sure you want to remove this goal?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Yes',
                style: 'destructive',
                onPress: () => {
                  removeGoal(g.id);
                  navigation.popToTop();
                },
              },
            ],
          )
        }
        style={({ pressed }) => [
          styles.removeButton,
          {
            borderColor: '#ef4444',
          },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={styles.removeButtonLabel}>Remove goal</Text>
      </Pressable>
    </Screen>
  );
}

function SmartRow({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={styles.smartRow}>
      <Text style={[styles.smartLabel, { color: colors.primary }]}>{label}</Text>
      <Text style={[styles.smartValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  smartRow: {
    marginTop: spacing.xs,
  },
  smartLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  smartValue: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  emptyCheckpoints: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  checkpoint: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  checkpointText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  checkpointLocked: {
    opacity: 0.62,
  },
  lockedHint: {
    fontSize: 12,
    fontWeight: '600',
    marginRight: spacing.xs,
  },
  aiCard: {
    marginTop: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  aiTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  aiBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  removeButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  removeButtonLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ef4444',
  },
});
