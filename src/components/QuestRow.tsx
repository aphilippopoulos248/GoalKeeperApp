import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
};

export function QuestRow({
  quest,
  completed,
  onToggle,
  variant = 'default',
  onAssistPress,
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
});
