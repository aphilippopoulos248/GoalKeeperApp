import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useActiveGoals } from '../context/ActiveGoalsContext';
import { GoalPlannerError } from '../services/openaiGoalPlanner';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import { formatScheduleRange } from '../utils/dailyQuestSchedule';

export function ScheduleAiAssistant() {
  const { colors } = useAppTheme();
  const {
    applyLifeScheduleMessage,
    clearLifeScheduleConstraints,
    goals,
    lifeScheduleSlots,
  } = useActiveGoals();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const hasDailies = useMemo(
    () =>
      goals.some(
        (g) =>
          !g.completed &&
          (g.dailyQuests?.filter((q) => q.kind === 'daily').length ?? 0) > 0,
      ),
    [goals],
  );

  const onSend = useCallback(async () => {
    const t = text.trim();
    if (!t || !hasDailies || loading) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await applyLifeScheduleMessage(t);
      setSuccess('Schedule updated around your constraints.');
      setText('');
    } catch (e) {
      setError(
        e instanceof GoalPlannerError
          ? e.message
          : 'Something went wrong. Check your connection and API key.',
      );
    } finally {
      setLoading(false);
    }
  }, [text, hasDailies, loading, applyLifeScheduleMessage]);

  const onClear = useCallback(async () => {
    if (lifeScheduleSlots.length === 0 || loading) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await clearLifeScheduleConstraints();
      setSuccess('Constraints cleared. Schedule rebalanced.');
    } catch (e) {
      setError(
        e instanceof GoalPlannerError
          ? e.message
          : 'Something went wrong. Check your connection and API key.',
      );
    } finally {
      setLoading(false);
    }
  }, [lifeScheduleSlots.length, loading, clearLifeScheduleConstraints]);

  return (
    <View
      style={[
        styles.wrap,
        {
          borderColor: colors.border,
          backgroundColor: colors.surfaceElevated,
        },
      ]}
    >
      <Text style={[styles.label, { color: colors.text }]}>
        Tell the AI about fixed blocks in your day
      </Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Example: I have work from 9am to 5pm.
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Describe when you’re busy…"
        placeholderTextColor={colors.textSecondary}
        multiline
        editable={hasDailies && !loading}
        style={[
          styles.input,
          {
            color: colors.text,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      />
      <Pressable
        onPress={() => {
          void onSend();
        }}
        disabled={!hasDailies || loading || !text.trim()}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: colors.primary,
            opacity: !hasDailies || loading || !text.trim() ? 0.45 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={styles.buttonLabel}>
          {loading ? 'Updating…' : 'Update schedule'}
        </Text>
      </Pressable>
      {lifeScheduleSlots.length > 0 ? (
        <View style={styles.constraintsBlock}>
          <Text style={[styles.constraintsTitle, { color: colors.text }]}>
            Current constraints
          </Text>
          {lifeScheduleSlots.map((s) => (
            <Text
              key={`${s.startMinute}-${s.endMinute}`}
              style={[styles.constraintRow, { color: colors.textSecondary }]}
            >
              {`\u2022 ${formatScheduleRange(s.startMinute, s.endMinute)}`}
            </Text>
          ))}
        </View>
      ) : null}
      <Pressable
        onPress={() => {
          void onClear();
        }}
        disabled={lifeScheduleSlots.length === 0 || loading}
        style={({ pressed }) => [
          styles.clearButton,
          {
            borderColor: colors.border,
            opacity:
              lifeScheduleSlots.length === 0 || loading ? 0.45 : pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text style={[styles.clearButtonLabel, { color: colors.text }]}>
          Clear constraints
        </Text>
      </Pressable>
      {!hasDailies ? (
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          Add a goal with daily quests to use this.
        </Text>
      ) : null}
      {loading ? (
        <ActivityIndicator style={styles.spinner} color={colors.primary} />
      ) : null}
      {error ? (
        <Text style={[styles.feedback, { color: colors.primary }]}>{error}</Text>
      ) : null}
      {success && !error ? (
        <Text style={[styles.feedback, { color: colors.textSecondary }]}>
          {success}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  hint: {
    fontSize: 13,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  input: {
    minHeight: 88,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 15,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  button: {
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  constraintsBlock: {
    marginTop: spacing.md,
  },
  constraintsTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  constraintRow: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  clearButton: {
    marginTop: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  clearButtonLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  note: {
    marginTop: spacing.sm,
    fontSize: 13,
    fontWeight: '500',
  },
  spinner: {
    marginTop: spacing.sm,
  },
  feedback: {
    marginTop: spacing.sm,
    fontSize: 14,
    fontWeight: '500',
  },
});
