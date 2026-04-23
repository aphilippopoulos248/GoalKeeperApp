import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { GoalMilestoneProgress } from '../components/GoalMilestoneProgress';
import { Screen } from '../components/Screen';
import { useActiveGoals } from '../context/ActiveGoalsContext';
import { useQuestProgress } from '../context/QuestProgressContext';
import {
  clearMilestoneRepromptDefer,
  deferMilestoneRepromptAfterNo,
} from '../navigation/milestoneDeferredReprompt';
import {
  navigateToNextMilestoneInQueue,
  shiftMilestoneCheck,
} from '../navigation/milestoneCheckQueue';
import { GoalsStackParamList } from '../navigation/goalsStackTypes';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import { computeGoalBarTargetPoints } from '../utils/goalBarTargetPoints';
import {
  computeBarHeadX,
  computePointsBarFraction,
  computeTrackLayout,
  getCurrentMilestoneToReachIndex,
  isCheckpointReachedByBarGeometry,
  TRACK_LEFT,
} from '../utils/milestoneProgressLayout';

type Props = NativeStackScreenProps<GoalsStackParamList, 'GoalDetail'>;

export function GoalDetailScreen({ route, navigation }: Props) {
  const { colors } = useAppTheme();
  const { getGoalById, removeGoal, toggleCheckpoint, revealCheckpoint } = useActiveGoals();
  const { goalBarEarned } = useQuestProgress();
  const [trackWidth, setTrackWidth] = useState(0);
  const [revealBusyId, setRevealBusyId] = useState<string | null>(null);
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

  const currentMilestoneToReachIndex = useMemo(
    () => getCurrentMilestoneToReachIndex(g?.checkpoints ?? [], layout, headX),
    [g, layout, headX],
  );

  const milestoneCheck = route.params.milestoneCheck;
  const checkCp =
    g && milestoneCheck
      ? g.checkpoints.find((c) => c.id === milestoneCheck.checkpointId)
      : undefined;
  const showMilestoneCheckModal = !!milestoneCheck && !!checkCp;

  useEffect(() => {
    if (milestoneCheck && g && !g.checkpoints.some((c) => c.id === milestoneCheck.checkpointId)) {
      shiftMilestoneCheck();
      navigation.setParams({ milestoneCheck: undefined });
      navigateToNextMilestoneInQueue();
    }
  }, [g, milestoneCheck, navigation]);

  useEffect(() => {
    if (milestoneCheck && !g) {
      shiftMilestoneCheck();
      navigation.setParams({ milestoneCheck: undefined });
      navigateToNextMilestoneInQueue();
    }
  }, [g, milestoneCheck, navigation]);

  const onResolveMilestone = useCallback(
    (sayYes: boolean) => {
      if (!g || !milestoneCheck || !checkCp) {
        if (milestoneCheck) {
          shiftMilestoneCheck();
          navigation.setParams({ milestoneCheck: undefined });
          navigateToNextMilestoneInQueue();
        }
        return;
      }
      if (checkCp.revealed !== false) {
        if (sayYes) {
          if (!checkCp.done) {
            toggleCheckpoint(g.id, checkCp.id);
          }
        } else if (checkCp.done) {
          toggleCheckpoint(g.id, checkCp.id);
        }
      }
      if (!sayYes) {
        deferMilestoneRepromptAfterNo(g.id, checkCp.id);
        navigation.setParams({ milestoneCheck: undefined });
        return;
      }
      clearMilestoneRepromptDefer(g.id, checkCp.id);
      shiftMilestoneCheck();
      navigation.setParams({ milestoneCheck: undefined });
      navigateToNextMilestoneInQueue();
    },
    [g, milestoneCheck, checkCp, navigation, toggleCheckpoint],
  );

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

      {g.achievabilityCritique ? (
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
              marginBottom: spacing.md,
            },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.text }]}>
            Achievability review
          </Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>
            {g.achievabilityCritique}
          </Text>
        </View>
      ) : null}

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
            const barReached = isCheckpointReachedByBarGeometry(c, i, layout, headX);
            const needsReveal = c.revealed === false;
            const isCurrentToReach = currentMilestoneToReachIndex === i;
            const earnHint = isCurrentToReach
              ? ' Current target milestone. Earn quest points until the bar reaches this one.'
              : '';
            const confirmHint = isCurrentToReach
              ? ' Current target milestone. Answer the confirmation dialog when it appears.'
              : '';
            const lockedLabelEarn = `${c.title}. Locked. Earn quest points until the bar reaches this milestone.${earnHint}`;
            const lockedLabelConfirm = `${c.title}. Locked. Waiting for you to confirm you completed this milestone.${confirmHint}`;
            const openLabel = `Checkpoint: ${c.title}. Completed. Tap to toggle.`;
            const unlockPromptLabel = `${c.title}. Ready to unlock. Tap to generate this milestone with AI.`;

            if (c.done) {
              return (
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
                        backgroundColor: colors.success,
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.checkpointText,
                      { color: colors.text },
                    ]}
                  >
                    {c.title}
                  </Text>
                </Pressable>
              );
            }

            if (barReached && needsReveal) {
              const busy = revealBusyId === c.id;
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityLabel={unlockPromptLabel}
                  disabled={busy}
                  onPress={async () => {
                    setRevealBusyId(c.id);
                    const res = await revealCheckpoint(g.id, c.id);
                    setRevealBusyId(null);
                    if (!res.ok) {
                      Alert.alert('Could not unlock milestone', res.error);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.checkpoint,
                    styles.checkpointUnlock,
                    {
                      backgroundColor: colors.surfaceElevated,
                      borderColor: colors.primary,
                    },
                    pressed && !busy && { opacity: 0.92 },
                    busy && { opacity: 0.85 },
                  ]}
                >
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: colors.primary },
                    ]}
                  />
                  <Text
                    style={[
                      styles.checkpointText,
                      { color: colors.text, fontWeight: '700' },
                    ]}
                  >
                    Unlock Milestone
                  </Text>
                  {busy ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
                  )}
                </Pressable>
              );
            }

            if (barReached && !needsReveal) {
              const lockedLabel = lockedLabelConfirm;
              return (
                <View
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: true }}
                  accessibilityLabel={lockedLabel}
                  style={[
                    styles.checkpoint,
                    isCurrentToReach ? null : styles.checkpointLocked,
                    {
                      backgroundColor: colors.surface,
                      borderColor: isCurrentToReach ? colors.primary : colors.border,
                      borderWidth: isCurrentToReach ? 2 : 1,
                      opacity: isCurrentToReach ? 1 : 0.62,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.dot,
                      {
                        backgroundColor: isCurrentToReach
                          ? colors.primary
                          : colors.border,
                      },
                    ]}
                  />
                  <View style={styles.checkpointTitleWithBadge}>
                    <Text
                      style={[
                        styles.checkpointText,
                        { color: isCurrentToReach ? colors.text : colors.textSecondary },
                      ]}
                    >
                      {c.title}
                    </Text>
                    {isCurrentToReach ? (
                      <View
                        style={[
                          styles.nextPill,
                          { backgroundColor: colors.primaryMuted },
                        ]}
                      >
                        <Text
                          style={[styles.nextPillText, { color: colors.primary }]}
                        >
                          Next
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.lockedHint, { color: colors.textSecondary }]}>
                    Awaiting confirmation
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
            }

            return (
              <View
                key={c.id}
                accessibilityRole="button"
                accessibilityState={{ disabled: true }}
                accessibilityLabel={lockedLabelEarn}
                style={[
                  styles.checkpoint,
                  isCurrentToReach ? null : styles.checkpointLocked,
                  {
                    backgroundColor: colors.surface,
                    borderColor: isCurrentToReach ? colors.primary : colors.border,
                    borderWidth: isCurrentToReach ? 2 : 1,
                    opacity: isCurrentToReach ? 1 : 0.62,
                  },
                ]}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: isCurrentToReach
                        ? colors.primary
                        : colors.border,
                    },
                  ]}
                />
                <View style={styles.checkpointTitleWithBadge}>
                  <Text
                    style={[
                      styles.checkpointText,
                      { color: isCurrentToReach ? colors.text : colors.textSecondary },
                    ]}
                  >
                    {c.title}
                  </Text>
                  {isCurrentToReach ? (
                    <View
                      style={[
                        styles.nextPill,
                        { backgroundColor: colors.primaryMuted },
                      ]}
                    >
                      <Text
                        style={[styles.nextPillText, { color: colors.primary }]}
                      >
                        Next
                      </Text>
                    </View>
                  ) : null}
                </View>
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

      <Modal
        visible={showMilestoneCheckModal}
        transparent
        animationType="fade"
        onRequestClose={() => onResolveMilestone(false)}
      >
        <View
          style={[styles.milestoneModalOverlay, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
        >
          <View
            style={[
              styles.milestoneModalCard,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.milestoneModalHeader}>
              <Ionicons
                name="sparkles"
                size={24}
                color={colors.primary}
                accessibilityLabel=""
              />
              <Text
                style={[styles.milestoneModalTitle, { color: colors.text }]}
                accessibilityRole="header"
              >
                Milestone
              </Text>
            </View>
            <Text
              style={[styles.milestoneModalBody, { color: colors.textSecondary }]}
            >
              Did you accomplish this milestone?
            </Text>
            {checkCp ? (
              <Text
                style={[styles.milestoneModalHighlight, { color: colors.text }]}
              >
                {checkCp.title}
              </Text>
            ) : null}
            <View style={styles.milestoneModalRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="No, I did not accomplish this milestone"
                onPress={() => onResolveMilestone(false)}
                style={({ pressed }) => [
                  styles.milestoneModalButton,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surface,
                  },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={[styles.milestoneModalButtonText, { color: colors.text }]}>
                  No
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Yes, I accomplished this milestone"
                onPress={() => onResolveMilestone(true)}
                style={({ pressed }) => [
                  styles.milestoneModalButton,
                  {
                    borderColor: colors.primary,
                    backgroundColor: colors.primary,
                  },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={[styles.milestoneModalButtonText, { color: '#ffffff' }]}>
                  Yes
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  checkpointTitleWithBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  nextPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    flexShrink: 0,
  },
  nextPillText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  checkpointLocked: {
    opacity: 0.62,
  },
  checkpointUnlock: {
    borderWidth: 2,
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
  milestoneModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  milestoneModalCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  milestoneModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  milestoneModalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  milestoneModalBody: {
    fontSize: 16,
    lineHeight: 22,
  },
  milestoneModalHighlight: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
  },
  milestoneModalRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  milestoneModalButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  milestoneModalButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
