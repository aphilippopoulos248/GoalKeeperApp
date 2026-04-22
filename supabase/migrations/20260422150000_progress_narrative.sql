-- Single counselor-synthesized progress story per user (quest AI context).

create table public.progress_narrative (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  body text not null,
  updated_at timestamptz not null default now()
);

alter table public.progress_narrative enable row level security;

create policy "progress_narrative_select_own"
  on public.progress_narrative for select
  using (auth.uid() = user_id);

create policy "progress_narrative_insert_own"
  on public.progress_narrative for insert
  with check (auth.uid() = user_id);

create policy "progress_narrative_update_own"
  on public.progress_narrative for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "progress_narrative_delete_own"
  on public.progress_narrative for delete
  using (auth.uid() = user_id);
