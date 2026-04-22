import { supabase } from '../../lib/supabase';

/**
 * Ensures a `public.profiles` row exists for the signed-in user so FK writes
 * (goals, quests, user_quest_stats, …) succeed. Safe to call on every session;
 * uses upsert on PK only. Requires RLS policy `profiles_insert_own` in Supabase.
 */
export async function ensurePublicProfileRow(userId: string): Promise<boolean> {
  const { error } = await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' });

  if (error) {
    console.error('[ensurePublicProfile] profiles upsert', error.message);
    return false;
  }
  return true;
}
