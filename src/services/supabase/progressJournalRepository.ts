import { supabase } from '../../lib/supabase';

export type JournalEntrySource = 'reflection' | 'debug_menu';

export type ProgressJournalRow = {
  id: string;
  user_id: string;
  body: string;
  entry_date: string;
  source: JournalEntrySource;
  created_at: string;
};

const RECENT_DAYS = 14;

/** Local calendar date (not UTC) for journal entry_date. */
export function formatLocalDateYyyyMmDd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Recent entries for the signed-in user, newest first. */
export async function fetchRecentProgressJournal(
  userId: string,
  options?: { maxDays?: number; limit?: number },
): Promise<ProgressJournalRow[]> {
  const maxDays = options?.maxDays ?? RECENT_DAYS;
  const limit = options?.limit ?? 200;
  const from = new Date();
  from.setDate(from.getDate() - maxDays);
  const fromStr = formatLocalDateYyyyMmDd(from);

  const { data, error } = await supabase
    .from('progress_journal_entries')
    .select('id, user_id, body, entry_date, source, created_at')
    .eq('user_id', userId)
    .gte('entry_date', fromStr)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[fetchRecentProgressJournal]', error);
    return [];
  }
  return (data ?? []) as ProgressJournalRow[];
}

export async function insertProgressJournalEntry(params: {
  userId: string;
  body: string;
  source: JournalEntrySource;
  entryDate?: string;
}): Promise<ProgressJournalRow | null> {
  const body = params.body.trim();
  if (!body) return null;
  const entryDate = params.entryDate ?? formatLocalDateYyyyMmDd(new Date());

  const { data, error } = await supabase
    .from('progress_journal_entries')
    .insert({
      user_id: params.userId,
      body,
      entry_date: entryDate,
      source: params.source,
    })
    .select('id, user_id, body, entry_date, source, created_at')
    .single();

  if (error) {
    console.error('[insertProgressJournalEntry]', error);
    return null;
  }
  return data as ProgressJournalRow;
}

/** Newest first in the string so recent context is at the top for the model. */
export function formatJournalRowsForAi(rows: ProgressJournalRow[]): string {
  if (rows.length === 0) return '';
  const sorted = [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return sorted
    .map((r) => {
      const tag = r.source === 'debug_menu' ? 'debug' : 'journal';
      return `[${r.entry_date} ${tag}] ${r.body}`;
    })
    .join('\n\n');
}

export async function hasProgressJournalOnDate(
  userId: string,
  localDate: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('progress_journal_entries')
    .select('id')
    .eq('user_id', userId)
    .eq('entry_date', localDate)
    .limit(1);
  if (error) {
    console.error('[hasProgressJournalOnDate]', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Counselor-synthesized story for quest generation (one row per user). */
export async function fetchProgressNarrative(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('progress_narrative')
    .select('body')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[fetchProgressNarrative]', error);
    return null;
  }
  const bodyRaw = (data as { body?: string } | null)?.body;
  if (typeof bodyRaw !== 'string' || !bodyRaw.trim()) {
    return null;
  }
  return bodyRaw.trim();
}

export async function upsertProgressNarrative(
  userId: string,
  body: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = body.trim();
  if (!trimmed) {
    return { ok: false, error: 'Narrative is empty.' };
  }
  const { error } = await supabase.from('progress_narrative').upsert(
    {
      user_id: userId,
      body: trimmed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error('[upsertProgressNarrative]', error);
    return { ok: false, error: error.message || 'Could not save narrative.' };
  }
  return { ok: true };
}

/** Removes all progress journal entries and the counselor narrative (full AI context reset). */
export async function deleteAllProgressJournalEntriesForUser(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: jErr } = await supabase
    .from('progress_journal_entries')
    .delete()
    .eq('user_id', userId);
  if (jErr) {
    console.error('[deleteAllProgressJournalEntriesForUser] journal', jErr);
    return { ok: false, error: jErr.message || 'Could not clear journal.' };
  }
  const { error: nErr } = await supabase.from('progress_narrative').delete().eq('user_id', userId);
  if (nErr) {
    console.error('[deleteAllProgressJournalEntriesForUser] narrative', nErr);
    return { ok: false, error: nErr.message || 'Could not clear progress narrative.' };
  }
  return { ok: true };
}
