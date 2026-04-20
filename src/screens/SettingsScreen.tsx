import { StyleSheet, Switch, Text, View } from 'react-native';

import { Screen } from '../components/Screen';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

export function SettingsScreen() {
  const { colors, mode, setMode } = useAppTheme();
  const dark = mode === 'dark';

  return (
    <Screen>
      <View
        style={[
          styles.row,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text }]}>Appearance</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Dark mode is the default. Toggle for light mode.
          </Text>
        </View>
        <Switch
          value={dark}
          onValueChange={(on) => setMode(on ? 'dark' : 'light')}
          trackColor={{ false: colors.border, true: colors.primaryMuted }}
          thumbColor={dark ? colors.primary : '#f4f4f5'}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  sub: {
    fontSize: 14,
    lineHeight: 20,
  },
});
