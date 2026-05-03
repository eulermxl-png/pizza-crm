-- Floor tables + bar for cashier; running tab orders link via orders.table_id.

create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique check (number >= 0 and number <= 6),
  name text not null,
  status text not null default 'free'
    check (status in ('free', 'occupied', 'waiting_payment')),
  current_order_id uuid references public.orders (id) on delete set null,
  opened_at timestamptz null
);

alter table public.orders
  add column if not exists table_id uuid references public.tables (id) on delete set null,
  add column if not exists is_table_order boolean not null default false;

create index if not exists orders_table_id_idx on public.orders (table_id);
create index if not exists orders_table_unpaid_idx
  on public.orders (table_id)
  where payment_method is null and table_id is not null;

comment on column public.orders.table_id is 'Dine-in table for running-tab orders; null for barra / walk-in.';
comment on column public.orders.is_table_order is 'True when this row belongs to a mesa running tab (payment often deferred until Cobrar mesa).';

insert into public.tables (number, name, status)
values
  (0, 'Barra', 'free'),
  (1, 'Mesa 1', 'free'),
  (2, 'Mesa 2', 'free'),
  (3, 'Mesa 3', 'free'),
  (4, 'Mesa 4', 'free'),
  (5, 'Mesa 5', 'free'),
  (6, 'Mesa 6', 'free')
on conflict (number) do nothing;

alter table public.tables enable row level security;

grant select, update on public.tables to authenticated;

drop policy if exists tables_owner_all on public.tables;
create policy tables_owner_all
  on public.tables
  for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists tables_cashier_select on public.tables;
create policy tables_cashier_select
  on public.tables
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'cashier'
    )
  );

drop policy if exists tables_cashier_update on public.tables;
create policy tables_cashier_update
  on public.tables
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

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'tables'
  ) then
    alter publication supabase_realtime add table public.tables;
  end if;
end $$;
