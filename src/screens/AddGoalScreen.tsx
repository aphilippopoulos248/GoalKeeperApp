import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '../components/Screen';
import { useActiveGoals } from '../context/ActiveGoalsContext';
import { GoalsStackParamList } from '../navigation/goalsStackTypes';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

type Props = NativeStackScreenProps<GoalsStackParamList, 'AddGoal'>;

export function AddGoalScreen({ navigation }: Props) {
  const { colors, mode } = useAppTheme();
  const { addGoal } = useActiveGoals();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetDate, setTargetDate] = useState(() => startOfTomorrow());
  const [pickerOpen, setPickerOpen] = useState(false);

  const formattedDate = useMemo(
    () =>
      targetDate.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    [targetDate],
  );

  const onDateChange = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === 'android') {
        if (event.type === 'dismissed') {
          setPickerOpen(false);
          return;
        }
        if (date) {
          setTargetDate(date);
        }
        setPickerOpen(false);
        return;
      }
      if (date) {
        setTargetDate(date);
      }
    },
    [],
  );

  const canSubmit =
    title.trim().length > 0 && description.trim().length > 0;

  const onAddToActive = useCallback(() => {
    if (!canSubmit) {
      return;
    }
    addGoal({
      title: title.trim(),
      description: description.trim(),
      targetDate,
    });
    navigation.popToTop();
  }, [addGoal, canSubmit, description, navigation, targetDate, title]);

  return (
    <Screen>
      <Pressable
        onPress={() => navigation.goBack()}
        style={({ pressed }) => [styles.backRow, pressed && { opacity: 0.7 }]}
      >
        <Ionicons name="chevron-back" size={22} color={colors.primary} />
        <Text style={[styles.backText, { color: colors.primary }]}>
          Back
        </Text>
      </Pressable>

      <Text style={[styles.heading, { color: colors.text }]}>New goal</Text>

      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Goal title
      </Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="What do you want to achieve?"
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Goal description
      </Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Why it matters and any context…"
        placeholderTextColor={colors.textSecondary}
        multiline
        textAlignVertical="top"
        style={[
          styles.input,
          styles.inputMultiline,
          {
            color: colors.text,
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
      />

      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Target date
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose target date"
        onPress={() => setPickerOpen(true)}
        style={({ pressed }) => [
          styles.dateField,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
          pressed && { opacity: 0.88 },
        ]}
      >
        <Text style={[styles.dateFieldText, { color: colors.text }]}>
          {formattedDate}
        </Text>
        <Ionicons name="calendar-outline" size={22} color={colors.primary} />
      </Pressable>

      {pickerOpen && Platform.OS === 'android' ? (
        <DateTimePicker
          value={targetDate}
          mode="date"
          display="default"
          onChange={onDateChange}
          themeVariant={mode === 'dark' ? 'dark' : 'light'}
        />
      ) : null}

      {pickerOpen && Platform.OS !== 'android' ? (
        <View
          style={[
            styles.pickerWrap,
            {
              backgroundColor: colors.surfaceElevated,
              borderColor: colors.border,
            },
          ]}
        >
          <DateTimePicker
            value={targetDate}
            mode="date"
            display="inline"
            onChange={onDateChange}
            themeVariant={mode === 'dark' ? 'dark' : 'light'}
          />
          <Pressable
            onPress={() => setPickerOpen(false)}
            style={({ pressed }) => [
              styles.doneRow,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.doneLabel, { color: colors.primary }]}>
              Done
            </Text>
          </Pressable>
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add to active goals"
        onPress={onAddToActive}
        disabled={!canSubmit}
        style={({ pressed }) => [
          styles.submit,
          {
            backgroundColor: canSubmit ? colors.primary : colors.border,
          },
          pressed && canSubmit && { opacity: 0.9 },
        ]}
      >
        <Text
          style={[
            styles.submitLabel,
            { color: canSubmit ? '#ffffff' : colors.textSecondary },
          ]}
        >
          Add to active
        </Text>
      </Pressable>
    </Screen>
  );
}

function startOfTomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
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
  heading: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  inputMultiline: {
    minHeight: 100,
    paddingTop: spacing.sm + 2,
  },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  dateFieldText: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  pickerWrap: {
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  doneRow: {
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  doneLabel: {
    fontSize: 16,
    fontWeight: '700',
  },
  submit: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  submitLabel: {
    fontSize: 17,
    fontWeight: '700',
  },
});
