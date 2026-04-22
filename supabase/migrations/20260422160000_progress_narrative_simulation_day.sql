-- Simulated day is kept in app memory for testing only, not in Postgres.
-- If this column was added earlier, remove it.
alter table public.progress_narrative
  drop column if exists simulation_day;
