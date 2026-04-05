-- Cash reconciliation: owner full access; cashier can record daily cierre.

grant select, insert, update, delete on table public.cash_reconciliation to authenticated;

drop policy if exists cash_recon_owner_all on public.cash_reconciliation;
create policy cash_recon_owner_all
  on public.cash_reconciliation
  for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists cash_recon_cashier_rw on public.cash_reconciliation;
create policy cash_recon_cashier_rw
  on public.cash_reconciliation
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'cashier'
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'cashier'
    )
  );
