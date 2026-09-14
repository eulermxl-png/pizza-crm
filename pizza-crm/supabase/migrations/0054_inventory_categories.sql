-- 0054_inventory_categories.sql
-- Categorías de materiales administrables desde Catálogos → Materiales.
create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists inventory_categories_name_unique
  on public.inventory_categories (lower(name));

alter table public.inventory_categories enable row level security;

drop policy if exists inv_cat_read on public.inventory_categories;
create policy inv_cat_read on public.inventory_categories
  for select to authenticated using (true);

drop policy if exists inv_cat_write on public.inventory_categories;
create policy inv_cat_write on public.inventory_categories
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

grant select, insert, update, delete on public.inventory_categories to authenticated;

insert into public.inventory_categories (name, sort_order) values
  ('Básicos', 10),
  ('Carnes', 20),
  ('Quesos y lácteos', 30),
  ('Frutas y verduras', 40),
  ('Salsas y aderezos', 50),
  ('Abarrotes', 55),
  ('Empaque y desechables', 60),
  ('Otros', 99)
on conflict do nothing;
