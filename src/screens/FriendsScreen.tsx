import { FlatList, StyleSheet, Text, View } from 'react-native';

import { Screen } from '../components/Screen';
import { mockFriends } from '../data/mockFriends';
import { Friend } from '../types';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

export function FriendsScreen() {
  const { colors } = useAppTheme();

  const renderItem = ({ item }: { item: Friend }) => (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
        },
      ]}
    >
      <View
        style={[styles.avatar, { backgroundColor: colors.primaryMuted }]}
      />
      <View style={styles.meta}>
        <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
        {item.subtitle ? (
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <Screen scroll={false}>
      <FlatList
        style={styles.flex}
        data={mockFriends}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={{ color: colors.textSecondary }}>No friends yet.</Text>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  meta: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
  },
  sub: {
    marginTop: 2,
    fontSize: 14,
  },
});
