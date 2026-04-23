-- Mutual friendships: one row per pair; app sends canonical (user_low, user_high) with text ordering.
create table public.friendships (
  user_low uuid not null references public.profiles (id) on delete cascade,
  user_high uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_low::text < user_high::text),
  primary key (user_low, user_high)
);

create index friendships_user_low_idx on public.friendships (user_low);
create index friendships_user_high_idx on public.friendships (user_high);

alter table public.friendships enable row level security;

create policy "friendships_select_participant"
  on public.friendships for select
  using (auth.uid() = user_low or auth.uid() = user_high);

create policy "friendships_insert_participant"
  on public.friendships for insert
  with check (auth.uid() = user_low or auth.uid() = user_high);

create policy "friendships_delete_participant"
  on public.friendships for delete
  using (auth.uid() = user_low or auth.uid() = user_high);

-- ORs with profiles_select_own: any authenticated user can read profiles (search + friend cards).
create policy "profiles_select_authenticated_directory"
  on public.profiles for select
  to authenticated
  using (true);
