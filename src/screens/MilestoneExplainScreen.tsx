import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '../components/Screen';
import { useActiveGoals } from '../context/ActiveGoalsContext';
import { useTypewriter } from '../hooks/useTypewriter';
import { GoalsStackParamList } from '../navigation/goalsStackTypes';
import { explainMilestoneDetail, GoalPlannerError } from '../services/openaiGoalPlanner';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import { parseMilestoneFrequency, parseGoalType } from '../utils/goalNormalize';

type Props = NativeStackScreenProps<GoalsStackParamList, 'MilestoneExplain'>;

const FADE_MS = 360;
const TYPE_CHAR_MS = 24;

export function MilestoneExplainScreen({ route, navigation }: Props) {
  const { goalId, checkpointId } = route.params;
  const { getGoalById } = useActiveGoals();
  const { colors } = useAppTheme();
  const g = getGoalById(goalId);
  const cp = g?.checkpoints.find((c) => c.id === checkpointId);

  const [loading, setLoading] = useState(true);
  const [explanation, setExplanation] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const { displayedText, isComplete } = useTypewriter(explanation, TYPE_CHAR_MS);

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: FADE_MS,
      useNativeDriver: true,
    }).start();
  }, [fade]);

  useEffect(() => {
    if (!g || !cp) {
      navigation.goBack();
    }
  }, [g, cp, navigation]);

  useEffect(() => {
    if (!g || !cp) return;
    const idx = g.checkpoints.findIndex((c) => c.id === cp.id);
    if (idx < 0) return;

    let unmounted = false;
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setExplanation('');

    (async () => {
      try {
        const todayIso = new Date().toISOString().slice(0, 10);
        const text = await explainMilestoneDetail({
          title: g.title,
          description: g.description,
          specific: g.specific,
          measurable: g.measurable,
          achievable: g.achievable,
          relevant: g.relevant,
          timeBound: g.timeBound,
          goalType: parseGoalType(g.goalType),
          milestoneFrequency: parseMilestoneFrequency(g.milestoneFrequency),
          milestoneIndex: idx + 1,
          totalMilestones: g.checkpoints.length,
          weekOffset: cp.weekOffset,
          checkpointTitle: cp.title,
          checkpointDone: cp.done,
          neighborBeforeTitle: idx > 0 ? g.checkpoints[idx - 1]!.title : null,
          neighborAfterTitle:
            idx < g.checkpoints.length - 1 ? g.checkpoints[idx + 1]!.title : null,
          targetDateIso: g.targetDateIso?.trim() || todayIso,
          todayIso,
          signal: ac.signal,
        });
        if (unmounted) return;
        setExplanation(text);
      } catch (e) {
        if (unmounted) return;
        if (e instanceof GoalPlannerError && e.code === 'aborted') {
          return;
        }
        const msg = e instanceof GoalPlannerError ? e.message : 'Request failed';
        Alert.alert('Could not explain milestone', msg, [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } finally {
        if (!unmounted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      unmounted = true;
      ac.abort();
    };
  }, [g, cp, goalId, checkpointId, navigation]);

  const onSkip = useCallback(() => {
    abortRef.current?.abort();
    navigation.goBack();
  }, [navigation]);

  const onContinue = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  if (!g || !cp) {
    return null;
  }

  const showSkip = loading || (explanation.length > 0 && !isComplete);
  const showContinue = !loading && explanation.length > 0 && isComplete;

  return (
    <Screen>
      <Animated.View
        style={[styles.fill, { opacity: fade, backgroundColor: colors.background }]}
      >
        <View
          style={[
            styles.headerCard,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.primaryMuted },
          ]}
        >
          <Text style={[styles.kicker, { color: colors.primary }]}>Milestone</Text>
          <Text style={[styles.milestoneTitle, { color: colors.text }]}>{cp.title}</Text>
        </View>

        {loading && !explanation ? (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.hint, { color: colors.textSecondary }]}>
              Preparing an explanation…
            </Text>
          </View>
        ) : (
          <View style={styles.textBlock}>
            <Text style={[styles.body, { color: colors.text }]}>{displayedText}</Text>
          </View>
        )}

        <View style={styles.actions}>
          {showSkip ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Skip explanation"
              onPress={onSkip}
              style={({ pressed }) => [
                styles.btn,
                showContinue ? styles.btnHalf : styles.btnFull,
                styles.btnSecondary,
                { borderColor: colors.border, backgroundColor: colors.surface },
                pressed && { opacity: 0.88 },
              ]}
            >
              <Text style={[styles.btnText, { color: colors.text }]}>Skip</Text>
            </Pressable>
          ) : null}
          {showContinue ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Continue to goal"
              onPress={onContinue}
              style={({ pressed }) => [
                styles.btn,
                showSkip ? styles.btnHalf : styles.btnFull,
                styles.btnPrimary,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={[styles.btnText, { color: '#ffffff' }]}>Continue</Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  headerCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  milestoneTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
  },
  textBlock: {
    flex: 1,
    minHeight: 120,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
  },
  centerBlock: {
    flex: 1,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  hint: {
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  btn: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  btnFull: {
    flex: 1,
  },
  btnHalf: {
    flex: 1,
  },
  btnSecondary: {
    borderWidth: 1,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
