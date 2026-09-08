-- 0026: Inventario Fase 1 — unidades, compras, movimientos y costeo base
-- Aditiva: solo agrega tablas/columnas/funciones nuevas. NO altera nada del POS existente.
-- Aplicada en Supabase (kbkdymufoqhgcarkjjar) el 2026-08-29. Copia para el repo.

-- 1) Unidades y familias de medida
create table if not exists public.units (
  code text primary key,
  name text not null,
  family text not null check (family in ('peso','volumen','pieza')),
  to_base_factor numeric not null default 1  -- factor a la unidad base de su familia (g, ml, pza)
);

insert into public.units (code, name, family, to_base_factor) values
  ('g','Gramo','peso',1),
  ('kg','Kilogramo','peso',1000),
  ('ml','Mililitro','volumen',1),
  ('lt','Litro','volumen',1000),
  ('pza','Pieza','pieza',1)
on conflict (code) do nothing;

-- 2) Extender el catálogo de ingredientes (inventory_items ya existe)
alter table public.inventory_items
  add column if not exists base_unit text references public.units(code),
  add column if not exists min_stock numeric not null default 0,
  add column if not exists current_cost numeric not null default 0,   -- $ por unidad base (prom. ponderado)
  add column if not exists current_stock numeric not null default 0,  -- existencia en unidad base (cache)
  add column if not exists yield_pct numeric not null default 100,    -- % aprovechable (merma de proceso)
  add column if not exists count_tolerance_pct numeric not null default 5; -- banda de tolerancia de conteo

-- 3) Compras (entradas de inventario)
create table if not exists public.inventory_purchases (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id),
  purchase_qty numeric not null check (purchase_qty > 0),
  purchase_unit text not null references public.units(code),
  unit_cost numeric not null check (unit_cost >= 0),   -- $ por unidad de compra
  total_cost numeric not null check (total_cost >= 0),
  qty_base numeric not null,                            -- convertido a unidad base
  unit_cost_base numeric not null,                      -- $ por unidad base
  supplier text,
  purchased_at date not null default (now() at time zone 'America/Tijuana')::date,
  created_by uuid references public.users(id),
  expense_id uuid references public.expenses(id),
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists inventory_purchases_item_idx on public.inventory_purchases(item_id, purchased_at desc);

-- 4) Movimientos (kardex — fuente de verdad de la existencia)
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_items(id),
  type text not null check (type in ('purchase','consumption','waste','adjustment','count')),
  qty_base numeric not null,            -- + entra, - sale (unidad base)
  unit_cost_base numeric not null default 0,
  ref_type text,                        -- 'purchase' | 'order' | 'manual'
  ref_id uuid,
  reason text,                          -- obligatorio para 'waste'
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  note text
);
create index if not exists inventory_movements_item_idx on public.inventory_movements(item_id, created_at desc);

-- 5) RLS
alter table public.units enable row level security;
alter table public.inventory_purchases enable row level security;
alter table public.inventory_movements enable row level security;

create policy units_select_auth on public.units
  for select using (auth.uid() is not null);
create policy units_owner_all on public.units
  for all using (is_owner()) with check (is_owner());

create policy inventory_purchases_owner_all on public.inventory_purchases
  for all using (is_owner()) with check (is_owner());

create policy inventory_movements_owner_all on public.inventory_movements
  for all using (is_owner()) with check (is_owner());

grant select, insert, update, delete on public.units to authenticated;
grant select, insert, update, delete on public.inventory_purchases to authenticated;
grant select, insert, update, delete on public.inventory_movements to authenticated;

-- 6) Registrar una compra de forma atómica:
--    inserta compra + movimiento, recalcula costo promedio ponderado y existencia,
--    y crea el gasto en expenses (categoría Insumos) si se pide.
create or replace function public.apply_purchase(
  p_item_id uuid,
  p_purchase_qty numeric,
  p_purchase_unit text,
  p_unit_cost numeric,
  p_supplier text default null,
  p_purchased_at date default null,
  p_notes text default null,
  p_create_expense boolean default true
) returns uuid
language plpgsql
as $$
declare
  v_item public.inventory_items%rowtype;
  v_pu public.units%rowtype;
  v_bu public.units%rowtype;
  v_qty_base numeric;
  v_total numeric;
  v_unit_cost_base numeric;
  v_new_stock numeric;
  v_new_cost numeric;
  v_expense_id uuid;
  v_purchase_id uuid;
  v_date date := coalesce(p_purchased_at, (now() at time zone 'America/Tijuana')::date);
begin
  select * into v_item from public.inventory_items where id = p_item_id;
  if not found then raise exception 'Ingrediente no encontrado'; end if;
  if v_item.base_unit is null then
    raise exception 'El ingrediente "%" no tiene unidad base configurada', v_item.name;
  end if;

  select * into v_pu from public.units where code = p_purchase_unit;
  if not found then raise exception 'Unidad de compra inválida: %', p_purchase_unit; end if;
  select * into v_bu from public.units where code = v_item.base_unit;

  if v_pu.family <> v_bu.family then
    raise exception 'La unidad de compra (%) no es compatible con la unidad base (%)', p_purchase_unit, v_item.base_unit;
  end if;

  v_qty_base := p_purchase_qty * (v_pu.to_base_factor / v_bu.to_base_factor);
  v_total := round(p_purchase_qty * p_unit_cost, 4);
  v_unit_cost_base := case when v_qty_base = 0 then 0 else v_total / v_qty_base end;

  -- promedio ponderado
  v_new_stock := coalesce(v_item.current_stock, 0) + v_qty_base;
  if v_new_stock = 0 then
    v_new_cost := coalesce(v_item.current_cost, 0);
  else
    v_new_cost := ((coalesce(v_item.current_stock,0) * coalesce(v_item.current_cost,0)) + v_total) / v_new_stock;
  end if;

  if p_create_expense then
    insert into public.expenses (category, description, amount, date)
    values ('Insumos', 'Compra: ' || v_item.name || coalesce(' — ' || p_supplier, ''), v_total, v_date)
    returning id into v_expense_id;
  end if;

  insert into public.inventory_purchases
    (item_id, purchase_qty, purchase_unit, unit_cost, total_cost, qty_base, unit_cost_base,
     supplier, purchased_at, created_by, expense_id, notes)
  values
    (p_item_id, p_purchase_qty, p_purchase_unit, p_unit_cost, v_total, v_qty_base, v_unit_cost_base,
     p_supplier, v_date, auth.uid(), v_expense_id, p_notes)
  returning id into v_purchase_id;

  insert into public.inventory_movements
    (item_id, type, qty_base, unit_cost_base, ref_type, ref_id, created_by, note)
  values
    (p_item_id, 'purchase', v_qty_base, v_unit_cost_base, 'purchase', v_purchase_id, auth.uid(), p_notes);

  update public.inventory_items
    set current_stock = v_new_stock, current_cost = round(v_new_cost, 6)
    where id = p_item_id;

  return v_purchase_id;
end;
$$;

grant execute on function public.apply_purchase to authenticated;
