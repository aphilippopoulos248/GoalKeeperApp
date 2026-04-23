-- Optional profile fields collected during first-time onboarding.
alter table public.profiles
  add column if not exists name text;

alter table public.profiles
  add column if not exists background text;

-- Existing users: populate name so they skip first-time onboarding.
update public.profiles
set name = display_name
where name is null
  and display_name is not null;

update public.profiles
set name = username
where name is null
  and username is not null;
