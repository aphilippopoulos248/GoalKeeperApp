import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const ANDROID_CHANNEL = 'daily-reflection';

function isDailyReflectionPayload(data: Record<string, unknown> | null | undefined): boolean {
  return data != null && data.type === 'DAILY_REFLECTION';
}

export function initProgressReflectionNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Android channel + iOS permissions; schedules one repeating daily fire at 20:00 local.
 * No-op on web. Safe to call more than once (reschedules).
 */
export async function ensureDailyReflectionNotificationScheduled(
  options?: { hour?: number; minute?: number },
): Promise<void> {
  if (Platform.OS === 'web') return;
  const hour = typeof options?.hour === 'number' ? options!.hour : 20;
  const minute = typeof options?.minute === 'number' ? options!.minute : 0;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let final = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    final = status;
  }
  if (final !== 'granted') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
      name: 'Daily reflection',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  await Notifications.cancelAllScheduledNotificationsAsync();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Daily reflection',
      body: 'Your reflection is ready — open GoalKeeper to log progress and update quests.',
      data: { type: 'DAILY_REFLECTION' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: Platform.OS === 'android' ? ANDROID_CHANNEL : undefined,
    },
  });
}

export async function shouldOpenReflectionFromLastNotificationResponse(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const last = await Notifications.getLastNotificationResponseAsync();
  const data = last?.notification?.request?.content
    ?.data as Record<string, unknown> | undefined;
  return isDailyReflectionPayload(data);
}
