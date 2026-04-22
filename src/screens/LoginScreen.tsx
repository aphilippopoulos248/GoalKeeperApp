import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '../components/Screen';
import { setGreetingIntentReturning } from '../lib/greetingIntent';
import { supabase } from '../lib/supabase';
import type { RootStackParamList } from '../navigation/RootStack';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onLogin = async () => {
    setErrorMessage(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setErrorMessage(error.message);
      } else {
        setGreetingIntentReturning();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Text style={[styles.heading, { color: colors.text }]}>Log in</Text>

      <Text style={[styles.label, { color: colors.textSecondary }]}>
        Email
      </Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={colors.textSecondary}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        editable={!loading}
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
        Password
      </Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="password"
        textContentType="password"
        editable={!loading}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
      />

      {errorMessage ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {errorMessage}
        </Text>
      ) : null}

      <View style={styles.buttonWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log in"
          onPress={() => void onLogin()}
          disabled={loading}
          style={({ pressed }) => [
            styles.submit,
            { backgroundColor: colors.primary },
            (pressed || loading) && { opacity: 0.9 },
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={[styles.submitLabel, { color: '#ffffff' }]}>
              Log in
            </Text>
          )}
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Register"
        onPress={() => navigation.navigate('Register')}
        disabled={loading}
        style={({ pressed }) => [
          styles.secondaryLink,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={[styles.secondaryLinkText, { color: colors.primary }]}>
          Create an account
        </Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  error: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
    color: '#ef4444',
  },
  buttonWrap: {
    marginTop: spacing.sm,
  },
  submit: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  submitLabel: {
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryLink: {
    marginTop: spacing.lg,
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryLinkText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
