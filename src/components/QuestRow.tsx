import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import type { AssistFullExercise } from '../services/exerciseDbRapidApi';
import type { AssistFullRecipe } from '../services/spoonacularRecipes';
import { Quest } from '../types';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const RING_BOX = 36;
const STROKE_PROGRESS = 3.5;
const STROKE_TRACK = 2.5;
const R = RING_BOX / 2 - STROKE_PROGRESS / 2 - 1;
const CIRC = 2 * Math.PI * R;
const CENTER = RING_BOX / 2;

/** Hold duration before the quest is marked complete (ms). */
const HOLD_MS = 1300;
const RESET_MS = 180;

type QuestRowProps = {
  quest: Quest;
  completed: boolean;
  onToggle: () => void;
  /** Use inside GoalQuestCard-style wrapper (no outer border; transparent body). */
  variant?: 'default' | 'inCard';
  onAssistPress?: () => void;
  /** Recipe the user saved from AI Assist for this quest. */
  attachedRecipe?: AssistFullRecipe;
  /** Opens full recipe (e.g. modal). When omitted, the preview row is not tappable. */
  onAttachedRecipePress?: () => void;
  /** Exercise the user saved from AI Assist for this quest. */
  attachedExercise?: AssistFullExercise;
};

/** Ring column width + `rowInner` gap; aligns attachment rows with quest title text. */
const ATTACHED_BLOCK_INDENT = RING_BOX + spacing.md;

function HoldProgressRing({
  borderColor,
  progressColor,
  animatedOffset,
}: {
  borderColor: string;
  progressColor: string;
  animatedOffset: Animated.Value;
}) {
  return (
    <Svg width={RING_BOX} height={RING_BOX} viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}>
      <G transform={`rotate(-90 ${CENTER} ${CENTER})`}>
        <Circle
          cx={CENTER}
          cy={CENTER}
          r={R}
          stroke={borderColor}
          strokeWidth={STROKE_TRACK}
          fill="none"
        />
        <AnimatedCircle
          cx={CENTER}
          cy={CENTER}
          r={R}
          stroke={progressColor}
          strokeWidth={STROKE_PROGRESS}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${CIRC} ${CIRC}`}
          strokeDashoffset={animatedOffset}
        />
      </G>
    </Svg>
  );
}

export function QuestRow({
  quest,
  completed,
  onToggle,
  variant = 'default',
  onAssistPress,
  attachedRecipe,
  onAttachedRecipePress,
  attachedExercise,
}: QuestRowProps) {
  const { colors } = useAppTheme();
  const isInCard = variant === 'inCard';

  const holdOffset = useRef(new Animated.Value(CIRC)).current;
  const holdRunRef = useRef<Animated.CompositeAnimation | null>(null);
  const holdFinishedRef = useRef(false);

  useEffect(() => {
    if (completed) {
      holdRunRef.current?.stop?.();
      holdRunRef.current = null;
      holdOffset.stopAnimation();
      holdOffset.setValue(CIRC);
      holdFinishedRef.current = false;
    }
  }, [completed, holdOffset]);

  useEffect(() => {
    return () => {
      holdRunRef.current?.stop?.();
      holdOffset.stopAnimation();
    };
  }, [holdOffset]);

  const onHoldEnd = useCallback(() => {
    holdRunRef.current?.stop?.();
    holdRunRef.current = null;
    if (!holdFinishedRef.current) {
      Animated.timing(holdOffset, {
        toValue: CIRC,
        duration: RESET_MS,
        useNativeDriver: false,
      }).start();
    }
  }, [holdOffset]);

  const onHoldStart = useCallback(() => {
    holdRunRef.current?.stop?.();
    holdFinishedRef.current = false;
    holdOffset.setValue(CIRC);
    const run = Animated.timing(holdOffset, {
      toValue: 0,
      duration: HOLD_MS,
      useNativeDriver: false,
    });
    holdRunRef.current = run;
    run.start(({ finished }) => {
      holdRunRef.current = null;
      if (finished) {
        holdFinishedRef.current = true;
        onToggle();
      }
    });
  }, [holdOffset, onToggle]);

  let attachedRecipeBlock: ReactNode = null;
  if (attachedRecipe) {
    const preview = (
      <View
        style={[
          styles.savedRecipeRow,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        {attachedRecipe.image ? (
          <Image
            source={{ uri: attachedRecipe.image }}
            style={styles.savedRecipeThumb}
          />
        ) : null}
        <View style={styles.savedRecipeCopy}>
          <View style={styles.savedRecipeLabelRow}>
            <Ionicons name="star" size={14} color={colors.primary} />
            <Text style={[styles.savedRecipeLabel, { color: colors.textSecondary }]}>
              Saved recipe
            </Text>
          </View>
          <Text
            style={[styles.savedRecipeTitle, { color: colors.text }]}
            numberOfLines={1}
          >
            {attachedRecipe.title}
          </Text>
        </View>
      </View>
    );
    attachedRecipeBlock = (
      <View style={{ paddingLeft: ATTACHED_BLOCK_INDENT }}>
        {onAttachedRecipePress ? (
          <Pressable
            onPress={onAttachedRecipePress}
            style={({ pressed }) => [{ opacity: pressed ? 0.88 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`View saved recipe: ${attachedRecipe.title}`}
          >
            {preview}
          </Pressable>
        ) : (
          preview
        )}
      </View>
    );
  }

  const incompleteA11yLabel = `${quest.title}. ${quest.description}. ${quest.points} points.`;
  const incompleteA11yHint =
    'Hold your finger on this quest until the ring finishes to mark it complete. Release early to cancel.';
  const completeA11yLabel = `Completed: ${quest.title}`;
  const completeA11yHint = 'This quest is completed and cannot be unchecked.';

  const rowBody = completed ? (
    <View
      style={[styles.rowInner, styles.rowInnerStatic]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: true, disabled: true }}
      accessibilityLabel={completeA11yLabel}
      accessibilityHint={completeA11yHint}
    >
      <View
        style={[
          styles.completedCircle,
          {
            backgroundColor: colors.success,
            borderColor: colors.success,
          },
        ]}
      >
        <Ionicons name="checkmark" size={18} color="#ffffff" />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.text }]}>{quest.title}</Text>
        <Text style={[styles.desc, { color: colors.textSecondary }]}>
          {quest.description}
        </Text>
        <Text style={[styles.points, { color: colors.primary }]}>
          +{quest.points} pts
        </Text>
      </View>
    </View>
  ) : (
    <Pressable
      onPressIn={onHoldStart}
      onPressOut={onHoldEnd}
      style={({ pressed }) => [styles.rowInner, { opacity: pressed ? 0.92 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={incompleteA11yLabel}
      accessibilityHint={incompleteA11yHint}
    >
      <View style={styles.ringSlot}>
        <HoldProgressRing
          borderColor={colors.border}
          progressColor={colors.primary}
          animatedOffset={holdOffset}
        />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.text }]}>{quest.title}</Text>
        <Text style={[styles.desc, { color: colors.textSecondary }]}>
          {quest.description}
        </Text>
        <Text style={[styles.points, { color: colors.primary }]}>
          +{quest.points} pts
        </Text>
      </View>
    </Pressable>
  );

  return (
    <View
      style={[
        isInCard ? styles.rowInCard : styles.row,
        !isInCard && {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
        },
        isInCard && {
          backgroundColor: 'transparent',
        },
      ]}
    >
      <View style={styles.mainColumn}>
        {rowBody}
        {attachedRecipeBlock}
        {attachedExercise ? (
          <View style={{ paddingLeft: ATTACHED_BLOCK_INDENT }}>
            <View
              style={[
                styles.savedRecipeRow,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              {attachedExercise.gifUrl ? (
                <Image
                  source={{ uri: attachedExercise.gifUrl }}
                  style={styles.savedRecipeThumb}
                />
              ) : null}
              <View style={styles.savedRecipeCopy}>
                <View style={styles.savedRecipeLabelRow}>
                  <Ionicons name="star" size={14} color={colors.primary} />
                  <Text style={[styles.savedRecipeLabel, { color: colors.textSecondary }]}>
                    Saved exercise
                  </Text>
                </View>
                <Text
                  style={[styles.savedRecipeTitle, { color: colors.text }]}
                  numberOfLines={1}
                >
                  {attachedExercise.name}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>
      {onAssistPress ? (
        <Pressable
          onPress={onAssistPress}
          hitSlop={10}
          style={({ pressed }) => [
            styles.assistBtn,
            { opacity: pressed ? 0.72 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="AI assist for this quest"
        >
          <Ionicons
            name="help-circle-outline"
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  rowInCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    paddingTop: spacing.sm + 2,
    gap: spacing.sm,
  },
  mainColumn: {
    flex: 1,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  rowInnerStatic: {
    opacity: 1,
  },
  ringSlot: {
    marginTop: 1,
    width: RING_BOX,
    height: RING_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedCircle: {
    width: RING_BOX,
    height: RING_BOX,
    borderRadius: RING_BOX / 2,
    borderWidth: 2,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistBtn: {
    alignSelf: 'flex-start',
    paddingTop: 2,
    marginLeft: spacing.xs,
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  desc: {
    fontSize: 14,
    lineHeight: 20,
  },
  points: {
    marginTop: spacing.sm,
    fontSize: 13,
    fontWeight: '600',
  },
  savedRecipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    gap: spacing.sm,
    minHeight: 48,
  },
  savedRecipeThumb: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: '#e8e8e8',
  },
  savedRecipeCopy: {
    flex: 1,
    minWidth: 0,
  },
  savedRecipeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  savedRecipeLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  savedRecipeTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
});
