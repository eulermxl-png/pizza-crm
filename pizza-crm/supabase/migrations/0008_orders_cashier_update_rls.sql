-- Cashier: allow updating order status (same capability as kitchen at the data layer).

drop policy if exists orders_cashier_update on public.orders;

create policy orders_cashier_update
  on public.orders
  for update
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
