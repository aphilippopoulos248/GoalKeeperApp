import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';

const APP_TITLE = 'GoalKeeper';

export function AppHeader() {
  const { colors } = useAppTheme();

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.background, borderBottomColor: colors.border },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>{APP_TITLE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
