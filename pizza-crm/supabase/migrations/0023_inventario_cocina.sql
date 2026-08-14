-- 0023: Inventario para el perfil de cocina (reporte "Queda / Falta")
-- NOTA: esta migración YA fue aplicada en Supabase (2026-08-14). Copia para el repo — no re-ejecutar.

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'Otros',
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.inventory_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  notes text
);

create table public.inventory_report_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.inventory_reports(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id),
  level text not null check (level in ('suficiente','mitad','poco','agotado')),
  quantity_text text,
  unique (report_id, item_id)
);

alter table public.inventory_items enable row level security;
alter table public.inventory_reports enable row level security;
alter table public.inventory_report_items enable row level security;

-- Items: owner administra la lista; cocina puede ver y agregar; caja puede ver
create policy inventory_items_owner_all on public.inventory_items
  for all using (is_owner()) with check (is_owner());

create policy inventory_items_staff_select on public.inventory_items
  for select using (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('kitchen','cashier')
  ));

create policy inventory_items_kitchen_insert on public.inventory_items
  for insert with check (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'kitchen'
  ));

-- Reportes: owner y cocina todo; caja solo lectura
create policy inventory_reports_owner_all on public.inventory_reports
  for all using (is_owner()) with check (is_owner());

create policy inventory_reports_kitchen_all on public.inventory_reports
  for all using (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'kitchen'
  )) with check (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'kitchen'
  ));

create policy inventory_reports_cashier_select on public.inventory_reports
  for select using (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'cashier'
  ));

create policy inventory_report_items_owner_all on public.inventory_report_items
  for all using (is_owner()) with check (is_owner());

create policy inventory_report_items_kitchen_all on public.inventory_report_items
  for all using (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'kitchen'
  )) with check (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'kitchen'
  ));

create policy inventory_report_items_cashier_select on public.inventory_report_items
  for select using (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'cashier'
  ));

create index inventory_report_items_report_idx on public.inventory_report_items (report_id);
create index inventory_reports_created_idx on public.inventory_reports (created_at desc);

-- Seed de insumos (basado en el reporte real del equipo)
insert into public.inventory_items (name, category, sort_order) values
  ('Gas', 'Básicos', 10),
  ('Masas', 'Básicos', 20),
  ('Aceite de oliva', 'Básicos', 30),
  ('Salsa de tomate', 'Básicos', 40),
  ('Peperoni', 'Carnes', 110),
  ('Chorizo spicy', 'Carnes', 120),
  ('Salami', 'Carnes', 130),
  ('Tocino', 'Carnes', 140),
  ('Queso mozzarella', 'Quesos y lácteos', 210),
  ('Queso mozzarella fresco', 'Quesos y lácteos', 220),
  ('Queso Monterrey y cheddar', 'Quesos y lácteos', 230),
  ('Philadelphia', 'Quesos y lácteos', 240),
  ('Queso parmesano', 'Quesos y lácteos', 250),
  ('Queso ricota', 'Quesos y lácteos', 260),
  ('Crema', 'Quesos y lácteos', 270),
  ('Yogurt', 'Quesos y lácteos', 280),
  ('Tomate cherry', 'Frutas y verduras', 310),
  ('Albahaca', 'Frutas y verduras', 320),
  ('Arúgula', 'Frutas y verduras', 330),
  ('Menta', 'Frutas y verduras', 340),
  ('Habanero', 'Frutas y verduras', 350),
  ('Pepino persa', 'Frutas y verduras', 360),
  ('Limones', 'Frutas y verduras', 370),
  ('Aceitunas', 'Frutas y verduras', 380),
  ('Pesto', 'Salsas y aderezos', 410),
  ('Hot honey', 'Salsas y aderezos', 420),
  ('Salsa macha', 'Salsas y aderezos', 430),
  ('Chile chipotle', 'Salsas y aderezos', 440),
  ('Mayonesa', 'Salsas y aderezos', 450),
  ('Aderezo', 'Salsas y aderezos', 460),
  ('Cajas de pizza', 'Empaque y desechables', 510),
  ('Cajas para llevar (piezas individuales)', 'Empaque y desechables', 520),
  ('Tenedores', 'Empaque y desechables', 530),
  ('Tubo para la parte de afuera', 'Otros', 610);
