import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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

import { useAuthUser } from '../context/AuthUserContext';
import { rootNavigationRef } from '../navigation/rootNavigationRef';
import { updateProfileOnboarding } from '../services/supabase/profileRepository';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

const TYPE_MS = 38;
const ENTER_MS = 320;
const EXIT_MS = 450;

const WELCOME_MESSAGE =
  "Hello! Thank you for choosing our app. Let's get started shall we.";
const CLOSING_MESSAGE = "Let's start by setting your first goal.";

function holdMsForMessage(message: string): number {
  return Math.min(2600, 650 + message.length * 11);
}

type Phase =
  | 'welcome_type'
  | 'name_input'
  | 'background_input'
  | 'closing_type';

type Props = {
  visible: boolean;
  onFinished: () => void;
};

export function FirstTimeOnboardingOverlay({ visible, onFinished }: Props) {
  const { colors } = useAppTheme();
  const { userId } = useAuthUser();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;
  const [phase, setPhase] = useState<Phase>('welcome_type');
  const [welcomeShown, setWelcomeShown] = useState('');
  const [closingShown, setClosingShown] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [backgroundDraft, setBackgroundDraft] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameDraftRef = useRef(nameDraft);
  const backgroundDraftRef = useRef(backgroundDraft);
  nameDraftRef.current = nameDraft;
  backgroundDraftRef.current = backgroundDraft;
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  const runSaveAndFinish = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    setSaveError(null);
    const bg =
      backgroundDraftRef.current.trim() === '' ? null : backgroundDraftRef.current.trim();
    const { error } = await updateProfileOnboarding(userId, {
      name: nameDraftRef.current,
      background: bg,
    });
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    if (rootNavigationRef.isReady()) {
      rootNavigationRef.navigate('Main', {
        screen: 'RootTabs',
        params: {
          screen: 'ActiveGoals',
          params: { screen: 'AddGoal' },
        },
      });
    }
    Animated.timing(fade, {
      toValue: 0,
      duration: EXIT_MS,
      useNativeDriver: true,
    }).start(({ finished: exitFinished }) => {
      if (!exitFinished) return;
      onFinishedRef.current();
    });
  }, [userId, fade]);

  useEffect(() => {
    if (!visible) {
      setPhase('welcome_type');
      setWelcomeShown('');
      setClosingShown('');
      setNameDraft('');
      setBackgroundDraft('');
      setNameError(null);
      setSaveError(null);
      setSaving(false);
      fade.setValue(0);
      scale.setValue(0.92);
    }
  }, [visible, fade, scale]);

  useEffect(() => {
    if (!visible || phase !== 'welcome_type') {
      return;
    }

    let cancelled = false;
    setWelcomeShown('');
    fade.setValue(0);
    scale.setValue(0.92);

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
        setWelcomeShown(WELCOME_MESSAGE.slice(0, i));
        if (i >= WELCOME_MESSAGE.length) {
          if (typeInterval) clearInterval(typeInterval);
          typeInterval = null;
          holdTimeout = setTimeout(() => {
            if (cancelled) return;
            setPhase('name_input');
          }, holdMsForMessage(WELCOME_MESSAGE));
        }
      }, TYPE_MS);
    });

    return () => {
      cancelled = true;
      enter.stop();
      if (typeInterval) clearInterval(typeInterval);
      if (holdTimeout) clearTimeout(holdTimeout);
    };
  }, [visible, phase, fade, scale]);

  useEffect(() => {
    if (!visible || phase !== 'closing_type' || !userId) {
      return;
    }

    let cancelled = false;
    setClosingShown('');
    setSaveError(null);

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
        setClosingShown(CLOSING_MESSAGE.slice(0, i));
        if (i >= CLOSING_MESSAGE.length) {
          if (typeInterval) clearInterval(typeInterval);
          typeInterval = null;
          holdTimeout = setTimeout(() => {
            if (cancelled) return;
            void runSaveAndFinish();
          }, holdMsForMessage(CLOSING_MESSAGE));
        }
      }, TYPE_MS);
    });

    return () => {
      cancelled = true;
      enter.stop();
      if (typeInterval) clearInterval(typeInterval);
      if (holdTimeout) clearTimeout(holdTimeout);
    };
  }, [visible, phase, userId, fade, scale, runSaveAndFinish]);

  const onContinueName = () => {
    const t = nameDraft.trim();
    if (!t) {
      setNameError('Please enter your name.');
      return;
    }
    setNameError(null);
    setPhase('background_input');
  };

  const onContinueBackground = () => {
    setPhase('closing_type');
  };

  if (!visible) {
    return null;
  }

  const backdropStyle: ViewStyle = {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.surface,
    zIndex: 1000,
  };

  const headingStyle = [
    styles.heading,
    { color: colors.text },
  ] as const;

  const messageFontSize =
    phase === 'welcome_type'
      ? WELCOME_MESSAGE.length > 220
        ? 18
        : 22
      : CLOSING_MESSAGE.length > 220
        ? 18
        : 22;
  const lineHeight = messageFontSize + 8;

  return (
    <Animated.View style={[backdropStyle, { opacity: fade }]} pointerEvents="auto">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={[styles.inner, { transform: [{ scale }] }]}>
            {phase === 'welcome_type' ? (
              <Text
                style={[
                  styles.message,
                  { color: colors.text, fontSize: messageFontSize, lineHeight },
                ]}
                accessibilityRole="text"
                accessibilityLiveRegion="polite"
              >
                {welcomeShown}
              </Text>
            ) : null}

            {phase === 'name_input' ? (
              <View style={styles.formBlock}>
                <Text style={headingStyle}>Tell us your name</Text>
                <TextInput
                  value={nameDraft}
                  onChangeText={(t) => {
                    setNameDraft(t);
                    if (nameError) setNameError(null);
                  }}
                  placeholder="Your name"
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.input,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceElevated,
                    },
                  ]}
                  autoCapitalize="words"
                  autoCorrect
                  editable={!saving}
                  accessibilityLabel="Your name"
                />
                {nameError ? (
                  <Text style={[styles.fieldError, { color: '#ef4444' }]}>{nameError}</Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Continue"
                  onPress={onContinueName}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { backgroundColor: colors.primary },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text style={styles.primaryButtonLabel}>Continue</Text>
                </Pressable>
              </View>
            ) : null}

            {phase === 'background_input' ? (
              <View style={styles.formBlock}>
                <Text style={headingStyle}>Tell us a little bit about you</Text>
                <TextInput
                  value={backgroundDraft}
                  onChangeText={setBackgroundDraft}
                  placeholder="Background, interests, what you're working toward…"
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.input,
                    styles.multiline,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.surfaceElevated,
                    },
                  ]}
                  multiline
                  textAlignVertical="top"
                  editable={!saving}
                  accessibilityLabel="About you"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Continue"
                  onPress={onContinueBackground}
                  style={({ pressed }) => [
                    styles.primaryButton,
                    { backgroundColor: colors.primary },
                    pressed && { opacity: 0.9 },
                  ]}
                >
                  <Text style={styles.primaryButtonLabel}>Continue</Text>
                </Pressable>
              </View>
            ) : null}

            {phase === 'closing_type' ? (
              <View style={styles.closingBlock}>
                {saveError ? (
                  <>
                    <Text style={[styles.saveError, { color: '#ef4444' }]}>{saveError}</Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Try again"
                      onPress={() => void runSaveAndFinish()}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        { backgroundColor: colors.primary },
                        pressed && { opacity: 0.9 },
                      ]}
                    >
                      <Text style={styles.primaryButtonLabel}>Try again</Text>
                    </Pressable>
                  </>
                ) : saving ? (
                  <ActivityIndicator size="large" color={colors.primary} />
                ) : (
                  <Text
                    style={[
                      styles.message,
                      { color: colors.text, fontSize: messageFontSize, lineHeight },
                    ]}
                    accessibilityRole="text"
                    accessibilityLiveRegion="polite"
                  >
                    {closingShown}
                  </Text>
                )}
              </View>
            ) : null}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    fontWeight: '600',
    textAlign: 'center',
  },
  formBlock: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  closingBlock: {
    minHeight: 120,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 17,
    marginBottom: spacing.md,
  },
  multiline: {
    minHeight: 120,
  },
  fieldError: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  saveError: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  primaryButton: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  primaryButtonLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#fff',
  },
});
