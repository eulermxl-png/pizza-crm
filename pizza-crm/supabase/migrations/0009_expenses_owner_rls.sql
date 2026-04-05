-- Expenses: owner access only (no changes to table columns; is_owner exists in 0004).

grant select, insert, update, delete on table public.expenses to authenticated;

drop policy if exists expenses_owner_all on public.expenses;
create policy expenses_owner_all
  on public.expenses
  for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());
