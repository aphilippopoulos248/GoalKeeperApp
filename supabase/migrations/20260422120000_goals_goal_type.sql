-- Goal type steers AI milestone labels and daily-quest framing.
alter table public.goals
  add column if not exists goal_type text not null default 'linear'
    check (goal_type in ('linear', 'biological', 'skill_based', 'outcome_based'));
