-- Deferred milestone copy: placeholders until user unlocks and taps "Unlock Milestone".
-- Existing rows default to revealed=true so legacy milestones behave unchanged.

alter table public.checkpoints
  add column if not exists content_revealed boolean not null default true,
  add column if not exists week_offset integer null;

comment on column public.checkpoints.content_revealed is
  'When false, title is a placeholder until AI generates milestone text on unlock.';
comment on column public.checkpoints.week_offset is
  'Planner week offset for this checkpoint (optional; used when generating milestone copy).';
