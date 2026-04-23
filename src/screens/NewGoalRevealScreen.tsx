import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../components/Screen';
import { GoalsStackParamList } from '../navigation/goalsStackTypes';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

type Props = NativeStackScreenProps<GoalsStackParamList, 'NewGoalReveal'>;

const FADE_MS = 380;
const STAGGER_MS = 400;

function navigateToGoalList(navigation: Props['navigation']) {
  const state = navigation.getState();
  const idx = state?.index ?? 0;
  if (idx > 0) {
    navigation.popToTop();
  } else {
    navigation.reset({
      index: 0,
      routes: [{ name: 'GoalList' }],
    });
  }
}

export function NewGoalRevealScreen({ route, navigation }: Props) {
  const { milestoneTitles, goalTitle } = route.params;
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();

  const [continueReady, setContinueReady] = useState(false);
  const animationGenerationRef = useRef(0);

  const milestoneFingerprint = JSON.stringify(milestoneTitles);

  const opacityValues = useMemo(
    () => [
      ...milestoneTitles.map(() => new Animated.Value(0)),
      new Animated.Value(0),
    ],
    [goalTitle, milestoneFingerprint],
  );

  useEffect(() => {
    setContinueReady(false);
    for (const v of opacityValues) {
      v.setValue(0);
    }

    const gen = ++animationGenerationRef.current;
    const steps = opacityValues.map((v) =>
      Animated.timing(v, {
        toValue: 1,
        duration: FADE_MS,
        useNativeDriver: true,
      }),
    );
    const composed = Animated.stagger(STAGGER_MS, steps);
    composed.start(({ finished }) => {
      if (finished && gen === animationGenerationRef.current) {
        setContinueReady(true);
      }
    });

    return () => {
      composed.stop();
      animationGenerationRef.current += 1;
    };
  }, [opacityValues]);

  const onContinue = useCallback(() => {
    navigateToGoalList(navigation);
  }, [navigation]);

  const bottomPad = useMemo(
    () => Math.max(insets.bottom, spacing.md),
    [insets.bottom],
  );

  const goalOpacity = opacityValues[opacityValues.length - 1]!;

  return (
    <Screen scroll={false}>
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>Your path</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Milestones we will track together
        </Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {milestoneTitles.map((title, i) => (
            <Animated.View
              key={`milestone-${i}`}
              style={[
                styles.card,
                {
                  opacity: opacityValues[i]!,
                  backgroundColor: colors.surfaceElevated,
                  borderColor: colors.primaryMuted,
                },
              ]}
            >
              <Text style={[styles.kicker, { color: colors.primary }]}>
                Milestone {i + 1}
              </Text>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
            </Animated.View>
          ))}

          <Animated.View
            style={[
              styles.card,
              styles.goalCard,
              {
                opacity: goalOpacity,
                backgroundColor: colors.surfaceElevated,
                borderColor: colors.primary,
              },
            ]}
          >
            <Text style={[styles.kicker, { color: colors.primary }]}>Your goal</Text>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{goalTitle}</Text>
          </Animated.View>
        </ScrollView>

        <View style={[styles.actions, { paddingBottom: bottomPad }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue to goals list"
            onPress={onContinue}
            disabled={!continueReady}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: colors.primary },
              !continueReady && styles.btnDisabled,
              pressed && continueReady && { opacity: 0.9 },
            ]}
          >
            <Text style={[styles.btnText, { color: '#ffffff' }]}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: spacing.md,
    flexGrow: 1,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  goalCard: {
    marginBottom: spacing.sm,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 24,
  },
  actions: {
    paddingTop: spacing.md,
  },
  btn: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    width: '100%',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
