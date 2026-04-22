-- Progress journal: user reflections used to steer daily quest generation.

create table public.progress_journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  entry_date date not null,
  source text not null default 'reflection'
    check (source in ('reflection', 'debug_menu')),
  created_at timestamptz not null default now()
);

create index progress_journal_entries_user_created_idx
  on public.progress_journal_entries (user_id, created_at desc);

create index progress_journal_entries_user_entry_date_idx
  on public.progress_journal_entries (user_id, entry_date desc);

alter table public.progress_journal_entries enable row level security;

create policy "progress_journal_select_own"
  on public.progress_journal_entries for select
  using (auth.uid() = user_id);

create policy "progress_journal_insert_own"
  on public.progress_journal_entries for insert
  with check (auth.uid() = user_id);

create policy "progress_journal_update_own"
  on public.progress_journal_entries for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "progress_journal_delete_own"
  on public.progress_journal_entries for delete
  using (auth.uid() = user_id);
