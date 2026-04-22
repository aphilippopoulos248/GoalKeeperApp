-- Fixes: "new row violates row-level security policy for table profiles" on client upsert.
-- Safe to run more than once.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_insert_own'
  ) then
    create policy "profiles_insert_own"
      on public.profiles
      for insert
      with check (auth.uid() = id);
  end if;
end
$$;
