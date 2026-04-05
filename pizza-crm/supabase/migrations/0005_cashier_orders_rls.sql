-- Orders: grants + RLS for cashiers (create orders) and staff read. Realtime for kitchen (step 5).

grant select, insert, update, delete on table public.orders to authenticated;
grant select, insert, update, delete on table public.order_items to authenticated;

drop policy if exists orders_owner_all on public.orders;
create policy orders_owner_all
  on public.orders
  for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists orders_staff_select on public.orders;
create policy orders_staff_select
  on public.orders
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('owner', 'cashier', 'kitchen')
    )
  );

drop policy if exists orders_cashier_insert on public.orders;
create policy orders_cashier_insert
  on public.orders
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'cashier'
    )
  );

drop policy if exists order_items_owner_all on public.order_items;
create policy order_items_owner_all
  on public.order_items
  for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists order_items_staff_select on public.order_items;
create policy order_items_staff_select
  on public.order_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('owner', 'cashier', 'kitchen')
    )
  );

drop policy if exists order_items_cashier_insert on public.order_items;
create policy order_items_cashier_insert
  on public.order_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'cashier'
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end $$;
