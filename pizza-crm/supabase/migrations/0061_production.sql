-- 0061_production.sql
-- Producción de preparaciones de la casa (p. ej. salsa de tomate casera).
-- Una tanda descuenta los ingredientes de la receta y suma el producto a su insumo
-- (p. ej. "Salsa de tomate", en ml) con el costo real de esos ingredientes.
-- No genera gasto: los ingredientes ya se pagaron al comprarlos.
-- Movimientos tipo 'production' (salida de ingredientes y entrada del producto):
-- NO cuentan como costo de venta; el costo entra cuando las pizzas consumen el producto.
-- Idempotente.

-- 1. Tipo de movimiento nuevo.
alter table public.inventory_movements drop constraint if exists inventory_movements_type_check;
alter table public.inventory_movements add constraint inventory_movements_type_check
  check (type = any (array['purchase','consumption','waste','adjustment','count','production']));

-- 2. Qué insumo produce cada receta (solo las preparaciones de la casa).
alter table public.recipes add column if not exists output_item_id uuid
  references public.inventory_items(id) on delete set null;

-- 3. Registro de tandas.
create table if not exists public.inventory_productions (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete restrict,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  qty_base numeric not null check (qty_base > 0),     -- cantidad producida, en unidad base del insumo
  total_cost numeric not null default 0,             -- costo de los ingredientes usados
  unit_cost_base numeric not null default 0,
  produced_at date not null default ((now() at time zone 'America/Tijuana')::date),
  notes text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists inventory_productions_produced_at_idx on public.inventory_productions(produced_at);

alter table public.inventory_productions enable row level security;
drop policy if exists inventory_productions_select on public.inventory_productions;
create policy inventory_productions_select on public.inventory_productions
  for select to authenticated using (public.is_owner_or_monitor());
-- Escritura solo por las funciones (security definer).

-- 4. Registrar una tanda.
create or replace function public.apply_production(
  p_recipe_id uuid,
  p_qty numeric,                 -- cantidad que salió, en p_unit
  p_unit text,                   -- p. ej. 'ml', 'l', 'g', 'kg'
  p_produced_at date default null,
  p_notes text default null
)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_recipe public.recipes%rowtype;
  v_item public.inventory_items%rowtype;
  v_qty_base numeric;
  v_yield_base numeric;
  v_mult numeric;
  u record;
  v_cost numeric;
  v_total numeric := 0;
  v_unit_cost numeric;
  v_new_stock numeric;
  v_new_cost numeric;
  v_id uuid;
  v_date date := coalesce(p_produced_at, (now() at time zone 'America/Tijuana')::date);
begin
  if not public.is_owner_or_monitor() then
    raise exception 'No autorizado para registrar producción';
  end if;
  if not (p_qty > 0) then raise exception 'La cantidad producida debe ser mayor que cero'; end if;

  select * into v_recipe from public.recipes where id = p_recipe_id;
  if not found then raise exception 'Receta no encontrada'; end if;
  if v_recipe.output_item_id is null then
    raise exception 'La receta "%" no tiene insumo de salida configurado', v_recipe.name;
  end if;

  select * into v_item from public.inventory_items where id = v_recipe.output_item_id for update;
  if not found or v_item.base_unit is null then
    raise exception 'El insumo de salida no tiene unidad configurada';
  end if;

  v_qty_base := public.convert_to_base(p_qty, p_unit, v_item.base_unit, v_item.piece_size);
  if v_qty_base is null or v_qty_base <= 0 then
    raise exception 'La unidad % no es compatible con el insumo "%" (%)', p_unit, v_item.name, v_item.base_unit;
  end if;

  -- Cuántas veces la receta: lo que salió / rendimiento útil de la receta.
  v_yield_base := public.convert_to_base(
    v_recipe.yield_qty * (coalesce(v_recipe.yield_pct, 100) / 100.0),
    v_recipe.yield_unit, v_item.base_unit, v_item.piece_size);
  if v_yield_base is null or v_yield_base <= 0 then
    raise exception 'Revisa el rendimiento de la receta "%" (cantidad y unidad)', v_recipe.name;
  end if;
  v_mult := v_qty_base / v_yield_base;

  insert into public.inventory_productions (recipe_id, item_id, qty_base, produced_at, notes, created_by)
  values (v_recipe.id, v_item.id, v_qty_base, v_date, p_notes, auth.uid())
  returning id into v_id;

  -- Salida de ingredientes (a su costo actual).
  for u in
    select ru.mat_id, sum(ru.qb) qb from public.recipe_usage(v_recipe.id, v_mult) ru group by ru.mat_id
  loop
    if u.mat_id = v_item.id then continue; end if;  -- protección: la receta no se consume a sí misma
    select coalesce(current_cost, 0) into v_cost from public.inventory_items where id = u.mat_id for update;
    v_total := v_total + u.qb * v_cost;
    insert into public.inventory_movements (item_id, type, qty_base, unit_cost_base, ref_type, ref_id, created_by, note)
    values (u.mat_id, 'production', -u.qb, v_cost, 'production', v_id, auth.uid(), 'Producción: ' || v_recipe.name);
    update public.inventory_items set current_stock = coalesce(current_stock, 0) - u.qb where id = u.mat_id;
  end loop;

  v_unit_cost := v_total / v_qty_base;

  -- Entrada del producto. Si la existencia previa no es positiva, el costo es el de esta tanda.
  v_new_stock := coalesce(v_item.current_stock, 0) + v_qty_base;
  if coalesce(v_item.current_stock, 0) <= 0 or v_new_stock <= 0 then
    v_new_cost := v_unit_cost;
  else
    v_new_cost := (v_item.current_stock * coalesce(v_item.current_cost, 0) + v_total) / v_new_stock;
  end if;

  insert into public.inventory_movements (item_id, type, qty_base, unit_cost_base, ref_type, ref_id, created_by, note)
  values (v_item.id, 'production', v_qty_base, v_unit_cost, 'production', v_id, auth.uid(), coalesce(p_notes, 'Producción'));

  update public.inventory_items
    set current_stock = v_new_stock, current_cost = round(v_new_cost, 6)
    where id = v_item.id;

  update public.inventory_productions
    set total_cost = round(v_total, 4), unit_cost_base = v_unit_cost
    where id = v_id;

  return v_id;
end;
$function$;
grant execute on function public.apply_production(uuid, numeric, text, date, text) to authenticated;

-- 5. Eliminar una tanda (regresa ingredientes y quita el producto).
create or replace function public.delete_production(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_p public.inventory_productions%rowtype;
  m record;
  v_stock numeric; v_cost numeric; v_new_stock numeric;
begin
  if not public.is_owner_or_monitor() then
    raise exception 'No autorizado para eliminar producción';
  end if;
  select * into v_p from public.inventory_productions where id = p_id for update;
  if not found then raise exception 'Producción no encontrada'; end if;

  -- Ingredientes: se regresa la existencia (su costo no cambió al salir).
  for m in
    select item_id, qty_base from public.inventory_movements
    where ref_type = 'production' and ref_id = p_id and item_id <> v_p.item_id
  loop
    update public.inventory_items set current_stock = coalesce(current_stock, 0) - m.qty_base where id = m.item_id;
  end loop;

  -- Producto: se quita la cantidad y se revierte el costo promedio cuando se puede.
  select coalesce(current_stock, 0), coalesce(current_cost, 0) into v_stock, v_cost
    from public.inventory_items where id = v_p.item_id for update;
  v_new_stock := v_stock - v_p.qty_base;
  update public.inventory_items
    set current_stock = v_new_stock,
        current_cost = case when v_new_stock > 0
                         then round(greatest(((v_stock * v_cost) - v_p.total_cost) / v_new_stock, 0), 6)
                         else current_cost end
    where id = v_p.item_id;

  delete from public.inventory_movements where ref_type = 'production' and ref_id = p_id;
  delete from public.inventory_productions where id = p_id;
end;
$function$;
grant execute on function public.delete_production(uuid) to authenticated;

-- 6. Enlace inicial: la salsa casera produce el insumo "Salsa de tomate".
update public.recipes r
   set output_item_id = i.id
  from public.inventory_items i
 where r.name = 'Salsa de tomate (Ronda)'
   and i.name = 'Salsa de tomate'
   and i.active
   and r.output_item_id is null;
