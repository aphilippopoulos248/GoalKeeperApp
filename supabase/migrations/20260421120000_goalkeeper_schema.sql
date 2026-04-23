-- GoalKeeperApp: public schema for Supabase (run via CLI or SQL editor).
--
-- If you already had auth.users before this migration, backfill profiles once:
--   insert into public.profiles (id) select id from auth.users on conflict (id) do nothing;
--   insert into public.user_quest_stats (user_id) select id from public.profiles
--     on conflict (user_id) do nothing;
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user (mirror of auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_username_lower on public.profiles (lower(username));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
create table public.user_quest_stats (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  streak integer not null default 0,
  last_daily_activity_date date,
  points_today_date date not null default (timezone('utc', now()))::date,
  points_today integer not null default 0,
  lifetime_quest_points integer not null default 0,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
create table public.goals (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null,
  specific text not null,
  measurable text not null,
  achievable text not null,
  relevant text not null,
  time_bound text not null,
  target_date_iso timestamptz,
  priority text not null default 'medium'
    check (priority in ('low', 'medium', 'high')),
  milestone_frequency text not null default 'weekly'
    check (milestone_frequency in ('weekly', 'biweekly', 'monthly')),
  achievability_critique text,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index goals_user_id_idx on public.goals (user_id);
create index goals_user_completed_idx on public.goals (user_id, completed);

-- ---------------------------------------------------------------------------
create table public.checkpoints (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id text not null references public.goals (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  sort_order integer not null default 0
);

create index checkpoints_goal_id_idx on public.checkpoints (goal_id);
create index checkpoints_user_id_idx on public.checkpoints (user_id);

-- ---------------------------------------------------------------------------
create table public.quests (
  id text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id text references public.goals (id) on delete cascade,
  title text not null,
  description text not null,
  points integer not null check (points >= 0),
  day_order integer check (day_order is null or (day_order >= 0 and day_order <= 999)),
  schedule_start_minute integer check (schedule_start_minute is null or (schedule_start_minute >= 0 and schedule_start_minute <= 1439)),
  schedule_duration_minutes integer
    check (schedule_duration_minutes is null or (schedule_duration_minutes >= 15 and schedule_duration_minutes <= 120)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index quests_user_id_idx on public.quests (user_id);
create index quests_goal_id_idx on public.quests (goal_id);

-- ---------------------------------------------------------------------------
create table public.quest_completions (
  user_id uuid not null references public.profiles (id) on delete cascade,
  quest_id text not null references public.quests (id) on delete cascade,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, quest_id)
);

-- ---------------------------------------------------------------------------
create table public.goal_bar_earned (
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id text not null references public.goals (id) on delete cascade,
  earned_points integer not null default 0 check (earned_points >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, goal_id)
);

-- ---------------------------------------------------------------------------
create table public.life_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  start_minute integer not null check (start_minute >= 0 and start_minute <= 1439),
  end_minute integer not null check (end_minute > start_minute and end_minute <= 1440),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index life_schedule_slots_user_idx on public.life_schedule_slots (user_id, sort_order);

-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_user_quest_stats_updated_at
  before update on public.user_quest_stats
  for each row execute function public.set_updated_at();

create trigger set_goals_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

create trigger set_quests_updated_at
  before update on public.quests
  for each row execute function public.set_updated_at();

create trigger set_quest_completions_updated_at
  before update on public.quest_completions
  for each row execute function public.set_updated_at();

create trigger set_goal_bar_earned_updated_at
  before update on public.goal_bar_earned
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_quest_stats enable row level security;
alter table public.goals enable row level security;
alter table public.checkpoints enable row level security;
alter table public.quests enable row level security;
alter table public.quest_completions enable row level security;
alter table public.goal_bar_earned enable row level security;
alter table public.life_schedule_slots enable row level security;

create policy "profiles_select_own"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "user_quest_stats_select_own"
  on public.user_quest_stats for select using (auth.uid() = user_id);
create policy "user_quest_stats_insert_own"
  on public.user_quest_stats for insert with check (auth.uid() = user_id);
create policy "user_quest_stats_update_own"
  on public.user_quest_stats for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "goals_select_own" on public.goals for select using (auth.uid() = user_id);
create policy "goals_insert_own" on public.goals for insert with check (auth.uid() = user_id);
create policy "goals_update_own" on public.goals for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals_delete_own" on public.goals for delete using (auth.uid() = user_id);

create policy "checkpoints_select_own" on public.checkpoints for select using (auth.uid() = user_id);
create policy "checkpoints_insert_own" on public.checkpoints for insert with check (auth.uid() = user_id);
create policy "checkpoints_update_own" on public.checkpoints for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "checkpoints_delete_own" on public.checkpoints for delete using (auth.uid() = user_id);

create policy "quests_select_own" on public.quests for select using (auth.uid() = user_id);
create policy "quests_insert_own" on public.quests for insert with check (auth.uid() = user_id);
create policy "quests_update_own" on public.quests for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "quests_delete_own" on public.quests for delete using (auth.uid() = user_id);

create policy "quest_completions_select_own" on public.quest_completions for select using (auth.uid() = user_id);
create policy "quest_completions_insert_own" on public.quest_completions for insert with check (auth.uid() = user_id);
create policy "quest_completions_update_own" on public.quest_completions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "quest_completions_delete_own" on public.quest_completions for delete using (auth.uid() = user_id);

create policy "goal_bar_earned_select_own" on public.goal_bar_earned for select using (auth.uid() = user_id);
create policy "goal_bar_earned_insert_own" on public.goal_bar_earned for insert with check (auth.uid() = user_id);
create policy "goal_bar_earned_update_own" on public.goal_bar_earned for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goal_bar_earned_delete_own" on public.goal_bar_earned for delete using (auth.uid() = user_id);

create policy "life_schedule_slots_select_own" on public.life_schedule_slots for select using (auth.uid() = user_id);
create policy "life_schedule_slots_insert_own" on public.life_schedule_slots for insert with check (auth.uid() = user_id);
create policy "life_schedule_slots_update_own" on public.life_schedule_slots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "life_schedule_slots_delete_own" on public.life_schedule_slots for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
create or replace function public.ensure_user_quest_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_quest_stats (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_profile_created_stats on public.profiles;
create trigger on_profile_created_stats
  after insert on public.profiles
  for each row execute function public.ensure_user_quest_stats();
