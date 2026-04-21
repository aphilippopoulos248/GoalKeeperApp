import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '../components/Screen';
import type { RootStackParamList } from '../navigation/RootStack';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const { colors } = useAppTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onLogin = () => {
    navigation.replace('Main', { screen: 'Menu' });
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
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
      />

      <View style={styles.buttonWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Log in"
          onPress={onLogin}
          style={({ pressed }) => [
            styles.submit,
            { backgroundColor: colors.primary },
            pressed && { opacity: 0.9 },
          ]}
        >
          <Text style={[styles.submitLabel, { color: '#ffffff' }]}>
            Log in
          </Text>
        </Pressable>
      </View>
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
  buttonWrap: {
    marginTop: spacing.sm,
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
