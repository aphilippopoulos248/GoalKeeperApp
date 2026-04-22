import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_DISMISSED = 'goalkeeper:reflection_dismissed_local_date';

export async function getReflectionDismissedDate(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_DISMISSED);
}

export async function setReflectionDismissedForToday(localYyyyMmDd: string): Promise<void> {
  await AsyncStorage.setItem(KEY_DISMISSED, localYyyyMmDd);
}
