import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@supabase/supabase-js';

export type GreetingAccountKind = 'new_account' | 'returning';

const PENDING_NEW_ACCOUNT_KEY = '@goalkeeper/pending-greeting-new-account-v1';

let pending: GreetingAccountKind | null = null;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Call after a successful `signUp` (with or without an immediate session) so the
 * next `SIGNED_IN` for this email shows the new-account greeting. Persists across
 * app restarts until consumed.
 */
export async function setGreetingIntentNewAccount(email: string): Promise<void> {
  pending = 'new_account';
  await AsyncStorage.setItem(
    PENDING_NEW_ACCOUNT_KEY,
    JSON.stringify({ email: normalizeEmail(email) }),
  );
}

/** Call before a normal login so the next `SIGNED_IN` prefers "welcome back" (unless a pending new-account intent matches the session email). */
export function setGreetingIntentReturning(): void {
  pending = 'returning';
}

function sessionEmail(user: User): string {
  return (user.email ?? '').trim().toLowerCase();
}

/**
 * Resolves and clears the greeting kind for this sign-in. Pending registration
 * (AsyncStorage) wins over in-memory "returning" from Login so first sign-in
 * after register still gets the new-account copy.
 */
export async function consumeGreetingIntent(user: User): Promise<GreetingAccountKind | null> {
  const email = sessionEmail(user);

  try {
    const raw = await AsyncStorage.getItem(PENDING_NEW_ACCOUNT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { email?: unknown };
      const pendingEmail =
        typeof parsed.email === 'string' ? normalizeEmail(parsed.email) : '';
      if (pendingEmail && email && pendingEmail === email) {
        await AsyncStorage.removeItem(PENDING_NEW_ACCOUNT_KEY);
        pending = null;
        return 'new_account';
      }
      await AsyncStorage.removeItem(PENDING_NEW_ACCOUNT_KEY);
    }
  } catch {
    await AsyncStorage.removeItem(PENDING_NEW_ACCOUNT_KEY);
  }

  const v = pending;
  pending = null;
  return v;
}
