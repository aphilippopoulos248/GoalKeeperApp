-- All quests in this table are daily (per-goal) or legacy account templates (goal_id is null, id like 'weekly-%').
drop index if exists public.quests_user_kind_idx;
alter table public.quests drop column if exists kind;
