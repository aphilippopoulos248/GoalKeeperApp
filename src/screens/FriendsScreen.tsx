import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Screen } from '../components/Screen';
import { useAuthUser } from '../context/AuthUserContext';
import {
  addFriend,
  friendSubtitle,
  friendTitle,
  listFriends,
  removeFriend,
  searchUsersByUsername,
} from '../services/supabase/friendsRepository';
import type { Friend } from '../types';
import { useAppTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

export function FriendsScreen() {
  const { colors } = useAppTheme();
  const { userId, authReady } = useAuthUser();

  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Friend[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const friendIds = useMemo(() => new Set(friends.map((f) => f.id)), [friends]);

  const reloadFriends = useCallback(async () => {
    if (!userId) {
      return;
    }
    setFriendsLoading(true);
    setListError(null);
    const list = await listFriends(userId);
    setFriends(list);
    setFriendsLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!authReady || !userId) {
      return;
    }
    void reloadFriends();
  }, [authReady, userId, reloadFriends]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (!authReady || !userId) {
      setSearchResults([]);
      return;
    }
    const q = debouncedQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    void searchUsersByUsername(q, userId).then((rows) => {
      if (!cancelled) {
        setSearchResults(rows);
        setSearchLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, userId, authReady]);

  const onAdd = async (friendUserId: string) => {
    if (!userId) {
      return;
    }
    setListError(null);
    const { error } = await addFriend(userId, friendUserId);
    if (error) {
      setListError(error);
      return;
    }
    await reloadFriends();
  };

  const onRemove = async (friendUserId: string) => {
    if (!userId) {
      return;
    }
    setListError(null);
    await removeFriend(userId, friendUserId);
    await reloadFriends();
  };

  const renderRow = (
    item: Friend,
    mode: 'friend' | 'search',
  ) => {
    const title = friendTitle(item);
    const subtitle = friendSubtitle(item);
    const isFriend = friendIds.has(item.id);
    const avatarUrl = item.avatar_url?.trim() ?? '';

    return (
      <View
        key={mode === 'friend' ? `fr-${item.id}` : `sr-${item.id}`}
        style={[
          styles.row,
          {
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
      >
        {avatarUrl.length > 0 ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <View
            style={[styles.avatar, { backgroundColor: colors.primaryMuted }]}
          />
        )}
        <View style={styles.meta}>
          <Text style={[styles.name, { color: colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {mode === 'friend' ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${title} from friends`}
            onPress={() => void onRemove(item.id)}
            hitSlop={12}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="person-remove-outline" size={24} color={colors.primary} />
          </Pressable>
        ) : isFriend ? (
          <View style={styles.addedHint} accessibilityLabel={`${title} is already a friend`}>
            <Ionicons name="checkmark-circle" size={22} color={colors.textSecondary} />
            <Text style={[styles.addedLabel, { color: colors.textSecondary }]}>Friends</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Add ${title} as a friend`}
            onPress={() => void onAdd(item.id)}
            hitSlop={12}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="person-add-outline" size={24} color={colors.primary} />
          </Pressable>
        )}
      </View>
    );
  };

  if (!authReady) {
    return (
      <Screen>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!userId) {
    return (
      <Screen>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          Sign in to search for friends and manage your list.
        </Text>
      </Screen>
    );
  }

  const showSearch = debouncedQuery.trim().length > 0;

  return (
    <Screen>
      <TextInput
        value={searchQuery}
        onChangeText={setSearchQuery}
        placeholder="Search by username or name"
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surfaceElevated,
            borderColor: colors.border,
          },
        ]}
      />

      {listError ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {listError}
        </Text>
      ) : null}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Friends</Text>
      {friendsLoading ? (
        <ActivityIndicator style={styles.sectionSpinner} color={colors.primary} />
      ) : friends.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>No friends yet.</Text>
      ) : (
        friends.map((f) => renderRow(f, 'friend'))
      )}

      {showSearch ? (
        <>
          <Text style={[styles.sectionTitle, styles.sectionSpacer, { color: colors.text }]}>
            Search results
          </Text>
          {searchLoading ? (
            <ActivityIndicator style={styles.sectionSpinner} color={colors.primary} />
          ) : searchResults.length === 0 ? (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>No matches.</Text>
          ) : (
            searchResults.map((f) => renderRow(f, 'search'))
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: {
    fontSize: 16,
    lineHeight: 22,
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
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionSpacer: {
    marginTop: spacing.lg,
  },
  sectionSpinner: {
    marginVertical: spacing.md,
  },
  empty: {
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarImage: {
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
  addedHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addedLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
});
