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
};

export function QuestRow({
  quest,
  completed,
  onToggle,
  variant = 'default',
}: QuestRowProps) {
  const { colors } = useAppTheme();
  const isInCard = variant === 'inCard';

  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [
        isInCard ? styles.rowInCard : styles.row,
        !isInCard && {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
        },
        isInCard && {
          backgroundColor: 'transparent',
        },
        { opacity: pressed ? 0.92 : 1 },
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
    gap: spacing.md,
  },
  rowInCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    paddingTop: spacing.sm + 2,
    gap: spacing.md,
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
