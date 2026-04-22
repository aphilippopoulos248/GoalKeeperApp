import { supabase } from '../../lib/supabase';

/**
 * Ensures a `public.profiles` row exists for the signed-in user so FK writes
 * (goals, quests, user_quest_stats, …) succeed. Safe to call on every session;
 * uses upsert on PK only. Requires RLS policy `profiles_insert_own` in Supabase.
 */
export async function ensurePublicProfileRow(userId: string): Promise<boolean> {
  const { error } = await supabase.from('profiles').upsert({ id: userId }, { onConflict: 'id' });

  // #region agent log
  fetch('http://127.0.0.1:7515/ingest/0f06e101-6d67-40ce-af4e-e83fcb67c81a', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '314115' },
    body: JSON.stringify({
      sessionId: '314115',
      runId: 'fk-debug',
      hypothesisId: 'H1',
      location: 'ensurePublicProfile.ts:upsert',
      message: 'profiles upsert',
      data: {
        ok: !error,
        code: error?.code ?? null,
        userIdLen: userId?.length ?? 0,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (error) {
    console.error('[ensurePublicProfile] profiles upsert', error.message);
    return false;
  }
  return true;
}
