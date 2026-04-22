import AsyncStorage from '@react-native-async-storage/async-storage';

/** Isolated per Supabase user (or signed-out bucket) on this device. */
export function userStorageScope(userId: string | null): string {
  return userId ?? '__signed_out__';
}

export function storageKeyForUser(baseKey: string, userId: string | null): string {
  return `${baseKey}:${userStorageScope(userId)}`;
}

/**
 * Reads from the scoped key; if missing, one-time migrates legacy unscoped data
 * (pre–per-user keys) into this scope and removes the legacy key.
 * Legacy is only migrated for a signed-in user so the login screen does not absorb
 * pre-upgrade data into the `__signed_out__` bucket.
 */
export async function getItemScopedWithLegacyMigrate(
  baseKey: string,
  userId: string | null,
): Promise<string | null> {
  const scoped = storageKeyForUser(baseKey, userId);
  const scopedVal = await AsyncStorage.getItem(scoped);
  if (scopedVal !== null) return scopedVal;
  if (userId === null) {
    return null;
  }
  const legacy = await AsyncStorage.getItem(baseKey);
  if (legacy === null) return null;
  await AsyncStorage.setItem(scoped, legacy);
  await AsyncStorage.removeItem(baseKey);
  return legacy;
}

export async function setItemScoped(
  baseKey: string,
  userId: string | null,
  value: string,
): Promise<void> {
  await AsyncStorage.setItem(storageKeyForUser(baseKey, userId), value);
}
