import type { User } from '@supabase/supabase-js';

export function displayNameFromUser(user: User): string {
  const raw = user.user_metadata?.username;
  const fromUsername =
    typeof raw === 'string' && raw.trim() ? raw.trim() : '';
  if (fromUsername) return fromUsername;
  const local = user.email?.split('@')[0]?.trim();
  if (local) return local;
  return 'Player';
}
