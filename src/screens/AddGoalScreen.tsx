import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '../components/Screen';
import { useActiveGoals } from '../context/ActiveGoalsContext';
import { GoalsStackParamList } from '../navigation/goalsStackTypes';
import {
  GoalPlannerError,
  classifyQuantificationNeed,
  critiqueGoalAchievability,
  planNewGoal,
} from '../services/openaiGoalPlanner';
import type { GoalPriority, GoalType, MilestoneFrequency } from '../types';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import { measurementTargetAlreadySpecified } from '../utils/goalQuantificationHeuristics';
import { recommendedGoalTypeFromText } from '../utils/goalTypeHeuristics';
import { mergeLifeSlotsWithOccupiedGoals } from '../utils/dailyQuestSchedule';
import { dailyQuestCountForPriority } from '../utils/goalPriority';

type Props = NativeStackScreenProps<GoalsStackParamList, 'AddGoal'>;

type Phase =
  | 'title'
  | 'specific'
  | 'difficulty'
  | 'quantify'
  | 'deadline'
  | 'why'
  | 'critique'
  | 'prefs';

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function startOfTomorrow(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** ~2 months from today at local noon, for sample debug goals */
function twoMonthsFromNowNoon(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  d.setHours(12, 0, 0, 0);
  return d;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function calendarDaysFromTodayTo(targetDate: Date): number {
  const start = startOfDay(new Date());
  const end = startOfDay(targetDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)));
}

function milestoneFrequencyForHorizonDays(days: number): MilestoneFrequency {
  if (days <= 60) return 'weekly';
  if (days <= 365) return 'biweekly';
  return 'monthly';
}

const DEFAULT_MEASUREMENT_QUESTION =
  'What number or amount would make this goal concrete and easy to track?';

function mergeDateAndTime(datePart: Date, timePart: Date): Date {
  const d = new Date(datePart);
  d.setHours(timePart.getHours(), timePart.getMinutes(), 0, 0);
  return d;
}

function buildRichDescription(input: {
  specifics: string;
  achievementDifficulty: string;
  quantityAnswer?: string;
  targetDate: Date;
  whyHelpful: string;
}): string {
  const lines: string[] = [`Details: ${input.specifics.trim()}`];
  lines.push(`What makes this difficult: ${input.achievementDifficulty.trim()}`);
  if (input.quantityAnswer?.trim()) {
    lines.push(`Concrete target: ${input.quantityAnswer.trim()}`);
  }
  lines.push(`Why this matters: ${input.whyHelpful.trim()}`);
  lines.push(`Target deadline: ${input.targetDate.toISOString()}`);
  return lines.join('\n');
}

export function AddGoalScreen({ navigation }: Props) {
  const { colors, mode } = useAppTheme();
  const { addGoal, goals, lifeScheduleSlots } = useActiveGoals();

  const [phase, setPhase] = useState<Phase>('title');
  const [shortTitle, setShortTitle] = useState('');
  const [specifics, setSpecifics] = useState('');
  const [achievementDifficulty, setAchievementDifficulty] = useState('');
  const [quantityAnswer, setQuantityAnswer] = useState('');
  const [quantifyQuestion, setQuantifyQuestion] = useState('');
  const [targetDate, setTargetDate] = useState(() => startOfTomorrow());
  const [whyHelpful, setWhyHelpful] = useState('');
  const [achievabilityCritique, setAchievabilityCritique] = useState('');
  const [priority, setPriority] = useState<GoalPriority>('medium');
  const [milestoneFrequency, setMilestoneFrequency] =
    useState<MilestoneFrequency>('weekly');
  const [goalType, setGoalType] = useState<GoalType>('linear');

  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  /** Android: pick date first, then time */
  const [androidDeadlineStep, setAndroidDeadlineStep] = useState<'date' | 'time' | null>(
    null,
  );
  const [pendingDatePart, setPendingDatePart] = useState<Date | null>(null);

  useEffect(() => {
    setMilestoneFrequency(
      milestoneFrequencyForHorizonDays(calendarDaysFromTodayTo(targetDate)),
    );
  }, [targetDate]);

  const combinedGoalText = useMemo(
    () =>
      [shortTitle, specifics, quantityAnswer, whyHelpful, achievementDifficulty]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(' '),
    [shortTitle, specifics, quantityAnswer, whyHelpful, achievementDifficulty],
  );

  useEffect(() => {
    setGoalType(recommendedGoalTypeFromText(combinedGoalText));
  }, [combinedGoalText]);

  const titleWordCount = useMemo(() => wordCount(shortTitle), [shortTitle]);
  const titleOk = titleWordCount > 0 && titleWordCount <= 5;
  const specificOk = specifics.trim().length > 0;
  const difficultyOk = achievementDifficulty.trim().length > 0;
  const quantifyOk = quantityAnswer.trim().length > 0;
  const whyOk = whyHelpful.trim().length > 0;

  const formattedDeadline = useMemo(
    () =>
      targetDate.toLocaleString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    [targetDate],
  );

  const goBackWithinFlow = useCallback(() => {
    switch (phase) {
      case 'title':
        navigation.goBack();
        break;
      case 'specific':
        setPhase('title');
        break;
      case 'difficulty':
        setPhase('specific');
        break;
      case 'quantify':
        setQuantityAnswer('');
        setPhase('difficulty');
        break;
      case 'deadline':
        if (quantityAnswer.trim()) {
          setPhase('quantify');
        } else {
          setPhase('difficulty');
        }
        break;
      case 'why':
        setPhase('deadline');
        break;
      case 'critique':
        setAchievabilityCritique('');
        setPhase('why');
        break;
      case 'prefs':
        setPhase('critique');
        break;
      default:
        break;
    }
  }, [navigation, phase, quantityAnswer]);

  const onDateChange = useCallback(
    (event: DateTimePickerEvent, date?: Date) => {
      if (Platform.OS === 'android') {
        if (event.type === 'dismissed') {
          setPickerOpen(false);
          setAndroidDeadlineStep(null);
          setPendingDatePart(null);
          return;
        }
        if (!date) return;
        if (androidDeadlineStep === 'date') {
          setPendingDatePart(date);
          setAndroidDeadlineStep('time');
          return;
        }
        if (androidDeadlineStep === 'time' && pendingDatePart) {
          setTargetDate(mergeDateAndTime(pendingDatePart, date));
          setPendingDatePart(null);
          setAndroidDeadlineStep(null);
          setPickerOpen(false);
        }
        return;
      }
      if (date) {
        setTargetDate(date);
      }
    },
    [androidDeadlineStep, pendingDatePart],
  );

  const openDeadlinePicker = useCallback(() => {
    if (Platform.OS === 'android') {
      setPendingDatePart(targetDate);
      setAndroidDeadlineStep('date');
    }
    setPickerOpen(true);
  }, [targetDate]);

  const closeIosPicker = useCallback(() => {
    setPickerOpen(false);
  }, []);

  const afterDifficultyContinue = useCallback(async () => {
    if (!difficultyOk) return;
    const combined = `${shortTitle} ${specifics} ${achievementDifficulty}`;
    if (measurementTargetAlreadySpecified(combined)) {
      setPhase('deadline');
      return;
    }

    setBusy(true);
    try {
      const r = await classifyQuantificationNeed({
        shortTitle,
        specifics,
        achievementDifficulty,
      });
      if (r.needsQuantification) {
        const q = r.suggestedQuestion.trim() || DEFAULT_MEASUREMENT_QUESTION;
        setQuantifyQuestion(q);
        setPhase('quantify');
      } else {
        setPhase('deadline');
      }
    } catch (err) {
      const message =
        err instanceof GoalPlannerError
          ? err.message
          : 'Could not analyze your goal. Try again.';
      Alert.alert('AI unavailable', message, [
        { text: 'Skip extra question', onPress: () => setPhase('deadline') },
        { text: 'Retry', onPress: () => void afterDifficultyContinue() },
      ]);
    } finally {
      setBusy(false);
    }
  }, [achievementDifficulty, difficultyOk, shortTitle, specifics]);

  const afterQuantifyContinue = useCallback(() => {
    if (!quantifyOk) return;
    setPhase('deadline');
  }, [quantifyOk]);

  const skipQuantify = useCallback(() => {
    setQuantityAnswer('');
    setPhase('deadline');
  }, []);

  const afterDeadlineContinue = useCallback(() => {
    setPhase('why');
  }, []);

  const afterWhyContinue = useCallback(async () => {
    if (!whyOk) return;
    setBusy(true);
    setPhase('critique');
    try {
      const today = new Date();
      const text = await critiqueGoalAchievability({
        shortTitle: shortTitle.trim(),
        specifics: specifics.trim(),
        achievementDifficulty: achievementDifficulty.trim(),
        quantificationAnswer: quantityAnswer.trim() || undefined,
        targetDateIso: targetDate.toISOString(),
        whyHelpful: whyHelpful.trim(),
        todayIso: today.toISOString(),
      });
      setAchievabilityCritique(text);
    } catch (err) {
      const message =
        err instanceof GoalPlannerError
          ? err.message
          : 'Something went wrong.';
      Alert.alert('Could not get critique', message, [
        { text: 'Back', style: 'cancel', onPress: () => setPhase('why') },
        {
          text: 'Retry',
          onPress: () => void afterWhyContinue(),
        },
      ]);
      setPhase('why');
    } finally {
      setBusy(false);
    }
  }, [
    achievementDifficulty,
    quantityAnswer,
    shortTitle,
    specifics,
    targetDate,
    whyHelpful,
    whyOk,
  ]);

  const afterCritiqueContinue = useCallback(() => {
    if (!achievabilityCritique.trim()) return;
    setPhase('prefs');
  }, [achievabilityCritique]);

  const fillDebugSampleGoal = useCallback(() => {
    // #region agent log
    fetch('http://127.0.0.1:7515/ingest/0f06e101-6d67-40ce-af4e-e83fcb67c81a', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': 'd523db',
      },
      body: JSON.stringify({
        sessionId: 'd523db',
        runId: 'debug-fill',
        hypothesisId: 'H1',
        location: 'AddGoalScreen.tsx:fillDebugSampleGoal',
        message: 'Debug sample autofill started',
        data: { targetPhase: 'prefs' },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    setPickerOpen(false);
    setAndroidDeadlineStep(null);
    setPendingDatePart(null);
    setShortTitle('Get fit lose weight');
    setSpecifics(
      'I want to get in shape and lose extra weight in a healthy, sustainable way over the next two months, with better meals and regular movement.',
    );
    setAchievementDifficulty(
      'I snack when stressed, and my work schedule makes it hard to keep workouts consistent every week.',
    );
    setQuantifyQuestion(DEFAULT_MEASUREMENT_QUESTION);
    setQuantityAnswer(
      'Lose about 8–12 pounds over 8 weeks, track weight weekly, and add 3 cardio sessions and 2 strength sessions per week.',
    );
    setTargetDate(twoMonthsFromNowNoon());
    setWhyHelpful(
      'I want more energy, better sleep, and confidence; losing weight is part of feeling healthier day to day.',
    );
    setAchievabilityCritique(
      'Two months is enough time for visible progress if you keep a modest calorie deficit and stay consistent with activity. Re-check progress weekly and adjust if loss stalls or feels too fast.',
    );
    setPriority('medium');
    setMilestoneFrequency('weekly');
    setGoalType('biological');
    setPhase('prefs');
  }, []);

  const createGoal = useCallback(async () => {
    setSubmitting(true);
    try {
      const today = new Date();
      const description = buildRichDescription({
        specifics,
        achievementDifficulty,
        quantityAnswer: quantityAnswer.trim() || undefined,
        targetDate,
        whyHelpful,
      });
      const input = {
        title: shortTitle.trim(),
        description,
        targetDate,
        priority,
        milestoneFrequency,
        goalType,
      };
      const enrichment = await planNewGoal({
        title: input.title,
        description: input.description,
        targetDateIso: input.targetDate.toISOString(),
        todayIso: today.toISOString(),
        completedCheckpointCount: 0,
        dailyQuestCount: dailyQuestCountForPriority(priority),
        milestoneFrequency,
        goalType,
        reservedScheduleSlots: mergeLifeSlotsWithOccupiedGoals(
          lifeScheduleSlots,
          goals.filter((g) => !g.completed),
        ),
      });
      const newGoal = addGoal(input, {
        enrichment,
        achievabilityCritique: achievabilityCritique.trim(),
      });
      navigation.replace('NewGoalReveal', {
        goalId: newGoal.id,
        milestoneTitles: newGoal.checkpoints.map((c) => c.title),
        goalTitle: newGoal.title,
      });
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7515/ingest/0f06e101-6d67-40ce-af4e-e83fcb67c81a', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'd523db' },
        body: JSON.stringify({
          sessionId: 'd523db',
          runId: 'create-goal',
          hypothesisId: 'H-ui',
          location: 'AddGoalScreen.tsx:createGoal',
          message: 'createGoal error',
          data: {
            isGpe: err instanceof GoalPlannerError,
            code: err instanceof GoalPlannerError ? err.code : null,
            msg:
              err instanceof GoalPlannerError
                ? err.message
                : err instanceof Error
                  ? err.name
                  : 'unknown',
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      const message =
        err instanceof GoalPlannerError
          ? err.message
          : 'Something went wrong. Try again.';
      Alert.alert('Could not create goal', message, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Retry',
          onPress: () => void createGoal(),
        },
      ]);
    } finally {
      setSubmitting(false);
    }
  }, [
    achievementDifficulty,
    achievabilityCritique,
    addGoal,
    goalType,
    goals,
    lifeScheduleSlots,
    milestoneFrequency,
    priority,
    quantityAnswer,
    shortTitle,
    specifics,
    targetDate,
    whyHelpful,
    navigation,
  ]);

  const assistantLine = (text: string) => (
    <Text style={[styles.assistant, { color: colors.textSecondary }]}>{text}</Text>
  );

  const renderBody = () => {
    if (phase === 'title') {
      return (
        <>
          {assistantLine('Describe your goal in no more than five words.')}
          <TextInput
            value={shortTitle}
            onChangeText={setShortTitle}
            placeholder="e.g. Get in shape"
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
          <Text
            style={[
              styles.hint,
              { color: titleOk ? colors.textSecondary : '#ef4444' },
            ]}
          >
            {titleWordCount}/5 words
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => titleOk && setPhase('specific')}
            disabled={!titleOk}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: titleOk ? colors.primary : colors.border,
              },
              pressed && titleOk && { opacity: 0.9 },
            ]}
          >
            <Text style={[styles.primaryBtnLabel, { color: '#ffffff' }]}>
              Continue
            </Text>
          </Pressable>
        </>
      );
    }

    if (phase === 'specific') {
      return (
        <>
          {assistantLine('Be more specific. What exactly do you want to achieve?')}
          <TextInput
            value={specifics}
            onChangeText={setSpecifics}
            placeholder="e.g. I want to improve my physique by losing weight in a sustainable way."
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
          <Pressable
            accessibilityRole="button"
            onPress={() => specificOk && setPhase('difficulty')}
            disabled={!specificOk}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: specificOk ? colors.primary : colors.border,
              },
              pressed && specificOk && { opacity: 0.9 },
            ]}
          >
            <Text
              style={[
                styles.primaryBtnLabel,
                { color: specificOk ? '#ffffff' : colors.textSecondary },
              ]}
            >
              Continue
            </Text>
          </Pressable>
        </>
      );
    }

    if (phase === 'difficulty') {
      return (
        <>
          {assistantLine('What makes this goal difficult for you to achieve?')}
          <TextInput
            value={achievementDifficulty}
            onChangeText={setAchievementDifficulty}
            placeholder="e.g. I struggle to stay consistent with dieting when work gets busy."
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
          <Pressable
            accessibilityRole="button"
            onPress={() => void afterDifficultyContinue()}
            disabled={!difficultyOk || busy}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor:
                  difficultyOk && !busy ? colors.primary : colors.border,
              },
              pressed && difficultyOk && !busy && { opacity: 0.9 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text
                style={[
                  styles.primaryBtnLabel,
                  { color: difficultyOk ? '#ffffff' : colors.textSecondary },
                ]}
              >
                Continue
              </Text>
            )}
          </Pressable>
        </>
      );
    }

    if (phase === 'quantify') {
      return (
        <>
          {assistantLine(quantifyQuestion)}
          <TextInput
            value={quantityAnswer}
            onChangeText={setQuantityAnswer}
            placeholder="Your answer…"
            placeholderTextColor={colors.textSecondary}
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
          <Pressable
            accessibilityRole="button"
            onPress={afterQuantifyContinue}
            disabled={!quantifyOk}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: quantifyOk ? colors.primary : colors.border,
              },
              pressed && quantifyOk && { opacity: 0.9 },
            ]}
          >
            <Text
              style={[
                styles.primaryBtnLabel,
                { color: quantifyOk ? '#ffffff' : colors.textSecondary },
              ]}
            >
              Continue
            </Text>
          </Pressable>
          <Pressable onPress={skipQuantify} style={styles.textLink}>
            <Text style={[styles.textLinkLabel, { color: colors.primary }]}>
              Skip
            </Text>
          </Pressable>
        </>
      );
    }

    if (phase === 'deadline') {
      return (
        <>
          {assistantLine(
            'What is the target deadline? Pick the date and time you want to achieve this.',
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose deadline"
            onPress={openDeadlinePicker}
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
              {formattedDeadline}
            </Text>
            <Ionicons name="calendar-outline" size={22} color={colors.primary} />
          </Pressable>

          {pickerOpen && Platform.OS === 'android' && androidDeadlineStep === 'date' ? (
            <DateTimePicker
              value={pendingDatePart ?? targetDate}
              mode="date"
              display="default"
              onChange={onDateChange}
              themeVariant={mode === 'dark' ? 'dark' : 'light'}
            />
          ) : null}
          {pickerOpen && Platform.OS === 'android' && androidDeadlineStep === 'time' ? (
            <DateTimePicker
              value={mergeDateAndTime(
                pendingDatePart ?? targetDate,
                targetDate,
              )}
              mode="time"
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
                mode="datetime"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={onDateChange}
                themeVariant={mode === 'dark' ? 'dark' : 'light'}
              />
              <Pressable
                onPress={closeIosPicker}
                style={({ pressed }) => [styles.doneRow, pressed && { opacity: 0.8 }]}
              >
                <Text style={[styles.doneLabel, { color: colors.primary }]}>
                  Done
                </Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={afterDeadlineContinue}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: colors.primary },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={[styles.primaryBtnLabel, { color: '#ffffff' }]}>
              Continue
            </Text>
          </Pressable>
        </>
      );
    }

    if (phase === 'why') {
      return (
        <>
          {assistantLine('How will working toward this goal help you?')}
          <TextInput
            value={whyHelpful}
            onChangeText={setWhyHelpful}
            placeholder="Motivation, values, outcomes…"
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
          <Pressable
            accessibilityRole="button"
            onPress={() => void afterWhyContinue()}
            disabled={!whyOk || busy}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: whyOk && !busy ? colors.primary : colors.border,
              },
              pressed && whyOk && !busy && { opacity: 0.9 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text
                style={[
                  styles.primaryBtnLabel,
                  { color: whyOk ? '#ffffff' : colors.textSecondary },
                ]}
              >
                Get AI critique
              </Text>
            )}
          </Pressable>
        </>
      );
    }

    if (phase === 'critique') {
      if (busy) {
        return (
          <View style={styles.critiqueLoading}>
            <ActivityIndicator size="large" color={colors.primary} />
            {assistantLine('Analyzing how achievable your goal is…')}
          </View>
        );
      }
      return (
        <>
          <Text style={[styles.critiqueTitle, { color: colors.text }]}>
            Achievability review
          </Text>
          <Text style={[styles.critiqueBody, { color: colors.textSecondary }]}>
            {achievabilityCritique}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={afterCritiqueContinue}
            disabled={!achievabilityCritique.trim()}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: achievabilityCritique.trim()
                  ? colors.primary
                  : colors.border,
              },
              pressed && achievabilityCritique.trim() && { opacity: 0.9 },
            ]}
          >
            <Text style={[styles.primaryBtnLabel, { color: '#ffffff' }]}>
              Continue
            </Text>
          </Pressable>
        </>
      );
    }

    if (phase === 'prefs') {
      return (
        <>
          {assistantLine(
            'Choose priority, milestone spacing, and what kind of goal this is (this shapes AI milestones).',
          )}
          <Text style={[styles.label, { color: colors.textSecondary }]}>Priority</Text>
          <View
            style={[
              styles.pickerWrapOuter,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
              },
            ]}
          >
            <Picker
              selectedValue={priority}
              onValueChange={(v) => setPriority(v as GoalPriority)}
              style={[styles.picker, { color: colors.text }]}
              mode={Platform.OS === 'android' ? 'dropdown' : undefined}
              dropdownIconColor={colors.textSecondary}
            >
              <Picker.Item label="Low" value="low" color={colors.text} />
              <Picker.Item label="Medium" value="medium" color={colors.text} />
              <Picker.Item label="High" value="high" color={colors.text} />
            </Picker>
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            Milestone frequency
          </Text>
          <View
            style={[
              styles.pickerWrapOuter,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
              },
            ]}
          >
            <Picker
              selectedValue={milestoneFrequency}
              onValueChange={(v) => setMilestoneFrequency(v as MilestoneFrequency)}
              style={[styles.picker, { color: colors.text }]}
              mode={Platform.OS === 'android' ? 'dropdown' : undefined}
              dropdownIconColor={colors.textSecondary}
            >
              <Picker.Item label="Weekly" value="weekly" color={colors.text} />
              <Picker.Item label="Bi-Weekly" value="biweekly" color={colors.text} />
              <Picker.Item label="Monthly" value="monthly" color={colors.text} />
            </Picker>
          </View>

          <Text style={[styles.label, { color: colors.textSecondary }]}>Goal type</Text>
          <View
            style={[
              styles.pickerWrapOuter,
              {
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.border,
              },
            ]}
          >
            <Picker
              selectedValue={goalType}
              onValueChange={(v) => setGoalType(v as GoalType)}
              style={[styles.picker, { color: colors.text }]}
              mode={Platform.OS === 'android' ? 'dropdown' : undefined}
              dropdownIconColor={colors.textSecondary}
            >
              <Picker.Item label="Linear (predictable)" value="linear" color={colors.text} />
              <Picker.Item
                label="Biological (nonlinear)"
                value="biological"
                color={colors.text}
              />
              <Picker.Item label="Skill-based" value="skill_based" color={colors.text} />
              <Picker.Item label="Outcome-based" value="outcome_based" color={colors.text} />
            </Picker>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add to active goals"
            onPress={() => void createGoal()}
            disabled={submitting}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: submitting ? colors.border : colors.primary,
              },
              pressed && !submitting && { opacity: 0.9 },
            ]}
          >
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={[styles.primaryBtnLabel, { color: '#ffffff' }]}>
                Add to active goals
              </Text>
            )}
          </Pressable>
        </>
      );
    }

    return null;
  };

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={goBackWithinFlow}
          style={({ pressed }) => [styles.backRow, pressed && { opacity: 0.7 }]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
          <Text style={[styles.backText, { color: colors.primary }]}>
            {phase === 'title' ? 'Back' : 'Previous'}
          </Text>
        </Pressable>

        <Text style={[styles.heading, { color: colors.text }]}>New goal</Text>

        {__DEV__ ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Debug fill sample goal"
            onPress={fillDebugSampleGoal}
            style={({ pressed }) => [
              styles.debugFillBtn,
              { borderColor: colors.border, backgroundColor: colors.surfaceElevated },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={[styles.debugFillBtnLabel, { color: colors.textSecondary }]}>
              Debug: fill sample (get in shape, lose weight, ~2 months)
            </Text>
          </Pressable>
        ) : null}

        {renderBody()}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xl,
  },
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
  debugFillBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: -spacing.md,
    marginBottom: spacing.lg,
  },
  debugFillBtnLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  assistant: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: spacing.md,
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
    marginBottom: spacing.sm,
  },
  inputMultiline: {
    minHeight: 100,
    paddingTop: spacing.sm + 2,
  },
  hint: {
    fontSize: 13,
    marginBottom: spacing.md,
  },
  primaryBtn: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryBtnLabel: {
    fontSize: 17,
    fontWeight: '700',
  },
  textLink: {
    alignSelf: 'center',
    marginTop: spacing.md,
    padding: spacing.sm,
  },
  textLinkLabel: {
    fontSize: 16,
    fontWeight: '600',
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
  pickerWrapOuter: {
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  picker: {
    marginVertical: -4,
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
  critiqueLoading: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  critiqueTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: spacing.sm,
  },
  critiqueBody: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: spacing.lg,
  },
});
