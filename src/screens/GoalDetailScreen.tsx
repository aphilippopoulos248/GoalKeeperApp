import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../components/Screen';
import { useActiveGoals } from '../context/ActiveGoalsContext';
import { GoalsStackParamList } from '../navigation/goalsStackTypes';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

type Props = NativeStackScreenProps<GoalsStackParamList, 'GoalDetail'>;

export function GoalDetailScreen({ route, navigation }: Props) {
  const { colors } = useAppTheme();
  const { getGoalById, toggleCheckpoint } = useActiveGoals();
  const g = getGoalById(route.params.goalId);

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
        Checkpoints
      </Text>
      {g.checkpoints.length === 0 ? (
        <Text style={[styles.emptyCheckpoints, { color: colors.textSecondary }]}>
          No checkpoints yet.
        </Text>
      ) : null}
      {g.checkpoints.map((c) => (
        <Pressable
          key={c.id}
          accessibilityRole="button"
          accessibilityLabel={`Checkpoint: ${c.title}. ${c.done ? 'Completed' : 'Not completed'}. Tap to toggle.`}
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
      ))}

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
            ? 'Daily quests on the Menu tab are tied to this goal while it is your newest active goal with AI quests. Complete checkpoints to refresh quests with higher difficulty.'
            : 'Add a goal with AI to fill SMART fields, checkpoints, and daily quests automatically.'}
        </Text>
      </View>
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
});
