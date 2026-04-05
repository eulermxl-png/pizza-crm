-- Kitchen: allow updating order status (preparing → ready → delivered).

drop policy if exists orders_kitchen_update on public.orders;

create policy orders_kitchen_update
  on public.orders
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'kitchen'
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'kitchen'
    )
  );
