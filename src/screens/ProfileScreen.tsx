import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../components/Screen';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

export function ProfileScreen() {
  const { colors } = useAppTheme();

  return (
    <Screen>
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Display name
        </Text>
        <Text style={[styles.value, { color: colors.text }]}>Alex Runner</Text>

        <Text style={[styles.label, { color: colors.textSecondary, marginTop: spacing.md }]}>
          Email
        </Text>
        <Text style={[styles.value, { color: colors.text }]}>
          alex@example.com
        </Text>

        <Text style={[styles.label, { color: colors.textSecondary, marginTop: spacing.md }]}>
          Level / rank
        </Text>
        <Text style={[styles.value, { color: colors.text }]}>
          Level 4 — Bronze challenger
        </Text>
      </View>

      <Text style={[styles.note, { color: colors.textSecondary }]}>
        Account sync and medals will arrive with Supabase in a later step.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
  },
  note: {
    marginTop: spacing.lg,
    fontSize: 14,
    lineHeight: 20,
  },
});
