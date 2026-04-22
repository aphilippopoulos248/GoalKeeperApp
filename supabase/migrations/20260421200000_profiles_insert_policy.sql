-- Allow authenticated users to create their own profile row if missing (e.g. pre-trigger accounts).
-- Required for FK targets: goals, quests, user_quest_stats, etc.
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);
