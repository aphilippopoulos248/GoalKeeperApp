import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AssistFullRecipe } from '../services/spoonacularRecipes';
import { Quest } from '../types';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

type QuestRowProps = {
  quest: Quest;
  completed: boolean;
  onToggle: () => void;
  /** Use inside GoalQuestCard-style wrapper (no outer border; transparent body). */
  variant?: 'default' | 'inCard';
  onAssistPress?: () => void;
  /** Recipe the user saved from AI Assist for this quest. */
  attachedRecipe?: AssistFullRecipe;
};

export function QuestRow({
  quest,
  completed,
  onToggle,
  variant = 'default',
  onAssistPress,
  attachedRecipe,
}: QuestRowProps) {
  const { colors } = useAppTheme();
  const isInCard = variant === 'inCard';

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
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.rowInner,
          { flex: 1, opacity: pressed ? 0.92 : 1 },
        ]}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
      >
        <View
          style={[
            styles.checkbox,
            {
              borderColor: completed ? colors.success : colors.border,
              backgroundColor: completed ? colors.success : 'transparent',
            },
          ]}
        >
          {completed ? (
            <Ionicons name="checkmark" size={16} color="#ffffff" />
          ) : null}
        </View>
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text }]}>{quest.title}</Text>
          <Text style={[styles.desc, { color: colors.textSecondary }]}>
            {quest.description}
          </Text>
          <Text style={[styles.points, { color: colors.primary }]}>
            +{quest.points} pts
          </Text>
          {attachedRecipe ? (
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
          ) : null}
        </View>
      </Pressable>
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
  rowInner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    gap: spacing.md,
  },
  assistBtn: {
    alignSelf: 'flex-start',
    paddingTop: 2,
    marginLeft: spacing.xs,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 2,
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
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
