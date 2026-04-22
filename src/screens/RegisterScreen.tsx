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
import { setGreetingIntentNewAccount } from '../lib/greetingIntent';
import { supabase } from '../lib/supabase';
import type { RootStackParamList } from '../navigation/RootStack';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const onRegister = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { username: username.trim() },
        },
      });
      if (error) {
        setErrorMessage(error.message);
        return;
      }
      await setGreetingIntentNewAccount(email);
      if (data.session) {
        return;
      }
      setSuccessMessage(
        'Check your email to finish signing up, then log in with your password.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Text style={[styles.heading, { color: colors.text }]}>Create account</Text>

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
        Username
      </Text>
      <TextInput
        value={username}
        onChangeText={setUsername}
        placeholder="Username"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
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
        autoComplete="password-new"
        textContentType="newPassword"
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

      {successMessage ? (
        <Text
          style={[styles.success, { color: colors.textSecondary }]}
          accessibilityLiveRegion="polite"
        >
          {successMessage}
        </Text>
      ) : null}

      <View style={styles.buttonWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create account"
          onPress={() => void onRegister()}
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
              Register
            </Text>
          )}
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go to log in"
        onPress={() => navigation.navigate('Login')}
        disabled={loading}
        style={({ pressed }) => [
          styles.secondaryLink,
          pressed && { opacity: 0.7 },
        ]}
      >
        <Text style={[styles.secondaryLinkText, { color: colors.primary }]}>
          Already have an account? Log in
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
  success: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: spacing.sm,
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
