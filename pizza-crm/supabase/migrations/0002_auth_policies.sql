-- Auth policies needed for role-based routing.
-- Allows an authenticated user to read only their own `public.users.role`.

grant select on table public.users to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
      and policyname = 'users_select_own'
  ) then
    create policy users_select_own
      on public.users
      for select
      to authenticated
      using (id = auth.uid());
  end if;
end $$;

