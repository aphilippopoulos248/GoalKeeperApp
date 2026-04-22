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

/** Removes all progress journal entries for the user (clears what the quest AI reads from the journal). */
export async function deleteAllProgressJournalEntriesForUser(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('progress_journal_entries')
    .delete()
    .eq('user_id', userId);
  if (error) {
    console.error('[deleteAllProgressJournalEntriesForUser]', error);
    return { ok: false, error: error.message || 'Could not clear journal.' };
  }
  return { ok: true };
}
