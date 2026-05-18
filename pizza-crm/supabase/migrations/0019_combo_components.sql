-- Combo products: optional component schema + order item marker for combo inclusions.
alter table public.products
  add column if not exists is_combo boolean not null default false;

alter table public.order_items
  add column if not exists is_combo_component boolean not null default false;

create table if not exists public.combo_components (
  id uuid primary key default gen_random_uuid(),
  combo_product_id uuid not null references public.products(id) on delete cascade,
  component_product_id uuid null references public.products(id) on delete set null,
  component_category text null,
  quantity integer not null default 1 check (quantity > 0),
  is_fixed boolean not null default false,
  sort_order integer not null default 0
);

create index if not exists combo_components_combo_product_idx
  on public.combo_components (combo_product_id, sort_order, id);

alter table public.combo_components enable row level security;

grant select, insert, update, delete on table public.combo_components to authenticated;

drop policy if exists combo_components_owner_all on public.combo_components;
create policy combo_components_owner_all
  on public.combo_components
  for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists combo_components_staff_select on public.combo_components;
create policy combo_components_staff_select
  on public.combo_components
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('cashier', 'kitchen')
    )
  );
