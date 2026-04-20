import { StyleSheet, Text, View } from 'react-native';

import { Quest } from '../types';
import { useAppTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';

import { QuestRow } from './QuestRow';

type QuestSectionProps = {
  title: string;
  quests: Quest[];
  completed: Record<string, boolean>;
  onToggle: (id: string) => void;
};

export function QuestSection({
  title,
  quests,
  completed,
  onToggle,
}: QuestSectionProps) {
  const { colors } = useAppTheme();

  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: colors.text }]}>{title}</Text>
      {quests.map((q) => (
        <QuestRow
          key={q.id}
          quest={q}
          completed={!!completed[q.id]}
          onToggle={() => onToggle(q.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
});
