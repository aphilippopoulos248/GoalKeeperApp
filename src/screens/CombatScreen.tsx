/**
 * Placeholder combat / boss flow. Not mounted in RootTabs; kept for future use.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../components/Screen';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

export function CombatScreen() {
  const { colors } = useAppTheme();

  return (
    <Screen>
      <Text style={[styles.lead, { color: colors.textSecondary }]}>
        Face bosses tied to your rank. 3D battles will plug in here in a later
        prototype step.
      </Text>

      <View
        style={[
          styles.arena,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.arenaLabel, { color: colors.textSecondary }]}>
          Boss arena (placeholder)
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.cta,
          {
            backgroundColor: colors.primary,
            opacity: pressed ? 0.9 : 1,
          },
        ]}
        onPress={() => {}}
      >
        <Text style={styles.ctaText}>Start encounter (coming soon)</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  arena: {
    minHeight: 200,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  arenaLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  cta: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  ctaText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
