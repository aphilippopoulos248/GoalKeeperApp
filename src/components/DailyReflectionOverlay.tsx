import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

const TYPE_MS = 38;
const ENTER_MS = 320;

function holdMsForMessage(message: string): number {
  return Math.min(2600, 650 + message.length * 11);
}

const INTRO_MESSAGE = `What did you achieve today? What new skills did you use or build? What outcomes showed up, or what might happen next because of your progress?

When you're ready, share a few lines — that context helps shape your next daily quests.`;

const DEBUG_NARRATIVE_ALERT_MAX = 4000;

function truncateForDebugAlert(s: string, max = DEBUG_NARRATIVE_ALERT_MAX): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

type TypingIntroProps = {
  message: string;
  onComplete: () => void;
  onSkip: () => void;
  colors: { text: string; primary: string; surface: string; textSecondary: string; border: string };
};

function TypingIntro({ message, onComplete, onSkip, colors }: TypingIntroProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const [shownText, setShownText] = useState('');
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setShownText('');
    fade.setValue(0);
    scale.setValue(0.92);
    let cancelled = false;
    let typeInterval: ReturnType<typeof setInterval> | null = null;
    let holdTimeout: ReturnType<typeof setTimeout> | null = null;

    const enter = Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: ENTER_MS,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: ENTER_MS,
        useNativeDriver: true,
      }),
    ]);

    enter.start(({ finished }) => {
      if (cancelled || !finished) return;
      let i = 0;
      typeInterval = setInterval(() => {
        if (cancelled) return;
        i += 1;
        setShownText(message.slice(0, i));
        if (i >= message.length) {
          if (typeInterval) clearInterval(typeInterval);
          typeInterval = null;
          holdTimeout = setTimeout(() => {
            if (cancelled) return;
            onCompleteRef.current();
          }, holdMsForMessage(message));
        }
      }, TYPE_MS);
    });

    return () => {
      cancelled = true;
      enter.stop();
      if (typeInterval) clearInterval(typeInterval);
      if (holdTimeout) clearTimeout(holdTimeout);
    };
  }, [message, fade, scale]);

  const fontSize = message.length > 300 ? 16 : message.length > 220 ? 18 : 20;
  const lineHeight = fontSize + 7;

  return (
    <View style={styles.introWrap}>
      <Pressable
        accessibilityLabel="Skip intro"
        onPress={onSkip}
        style={({ pressed }) => [styles.skipBtn, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Text style={{ color: colors.primary, fontWeight: '600' }}>Skip</Text>
      </Pressable>
      <Animated.View style={{ opacity: fade, transform: [{ scale }] }}>
        <Text
          style={[styles.introText, { color: colors.text, fontSize, lineHeight }]}
          accessibilityRole="text"
        >
          {shownText}
        </Text>
      </Animated.View>
    </View>
  );
}

type DailyReflectionOverlayProps = {
  visible: boolean;
  onNotNow: () => void;
  onSubmit: (
    body: string,
  ) => Promise<{ ok: true; narrative: string } | { ok: false; error: string }>;
  onAfterClose: () => void;
};

export function DailyReflectionOverlay({
  visible,
  onNotNow,
  onSubmit,
  onAfterClose,
}: DailyReflectionOverlayProps) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<'intro' | 'form'>('intro');
  const [achievements, setAchievements] = useState('');
  const [skills, setSkills] = useState('');
  const [outcomes, setOutcomes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (visible) {
      setPhase('intro');
      setAchievements('');
      setSkills('');
      setOutcomes('');
      setFormError('');
      setSaving(false);
    }
  }, [visible]);

  const skipToForm = useCallback(() => {
    setPhase('form');
  }, []);

  const buildBody = useCallback(() => {
    const parts: string[] = [];
    const a = achievements.trim();
    const s = skills.trim();
    const o = outcomes.trim();
    if (a) parts.push(`Achievements: ${a}`);
    if (s) parts.push(`New skills: ${s}`);
    if (o) parts.push(`Outcomes / what happened next: ${o}`);
    return parts.join('\n\n');
  }, [achievements, skills, outcomes]);

  const handleNotNow = useCallback(() => {
    onNotNow();
    onAfterClose();
  }, [onNotNow, onAfterClose]);

  const handleSubmit = useCallback(() => {
    const body = buildBody();
    if (!body) {
      setFormError('Add at least one line before submitting.');
      return;
    }
    setFormError('');
    void (async () => {
      setSaving(true);
      try {
        const res = await onSubmit(body);
        if (!res.ok) {
          setFormError(res.error ?? 'Could not save.');
          return;
        }
        onAfterClose();
        if (typeof __DEV__ !== 'undefined' && __DEV__) {
          Alert.alert(
            'AI progress narrative (debug)',
            truncateForDebugAlert(res.narrative),
            [{ text: 'OK' }],
          );
        }
      } finally {
        setSaving(false);
      }
    })();
  }, [buildBody, onSubmit, onAfterClose]);

  if (!visible) {
    return null;
  }

  const backdropStyle: ViewStyle = {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
    zIndex: 1000,
    paddingTop: insets.top + spacing.md,
    paddingBottom: insets.bottom + spacing.md,
  };

  return (
    <View style={backdropStyle} pointerEvents="auto">
      {phase === 'intro' ? (
        <TypingIntro
          message={INTRO_MESSAGE}
          onComplete={() => {
            setPhase('form');
          }}
          onSkip={skipToForm}
          colors={colors}
        />
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.formScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={[styles.formTitle, { color: colors.text }]}>Your reflection</Text>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Achievements</Text>
            <TextInput
              value={achievements}
              onChangeText={setAchievements}
              placeholder="What did you get done today?"
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            />
            <Text style={[styles.label, { color: colors.textSecondary }]}>New skills</Text>
            <TextInput
              value={skills}
              onChangeText={setSkills}
              placeholder="What did you learn or practice?"
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            />
            <Text style={[styles.label, { color: colors.textSecondary }]}>Outcomes</Text>
            <TextInput
              value={outcomes}
              onChangeText={setOutcomes}
              placeholder="What changed or might happen next from your progress?"
              placeholderTextColor={colors.textSecondary}
              multiline
              textAlignVertical="top"
              style={[
                styles.input,
                {
                  color: colors.text,
                  borderColor: colors.border,
                  backgroundColor: colors.background,
                },
              ]}
            />
            {formError ? (
              <Text style={[styles.error, { color: colors.textSecondary }]}>{formError}</Text>
            ) : null}
            <View style={styles.formActions}>
              <Pressable
                onPress={handleNotNow}
                disabled={saving}
                style={({ pressed }) => [
                  styles.secondaryBtn,
                  { borderColor: colors.border, opacity: saving ? 0.5 : pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Not now</Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit}
                disabled={saving}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    backgroundColor: colors.primary,
                    opacity: saving ? 0.6 : pressed ? 0.9 : 1,
                  },
                ]}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.primaryBtnText}>Save and update quests</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  introWrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  introText: {
    fontWeight: '600',
    textAlign: 'center',
  },
  skipBtn: {
    position: 'absolute',
    right: spacing.lg,
    top: 0,
    zIndex: 2,
    padding: spacing.sm,
  },
  formScroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    fontSize: 16,
  },
  error: {
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  formActions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryBtn: {
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
