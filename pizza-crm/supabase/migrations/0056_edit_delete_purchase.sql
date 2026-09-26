-- 0056_edit_delete_purchase.sql
-- Permite corregir o eliminar una compra ya registrada (owner o monitor).
-- Revierte el efecto de la compra original en existencia y costo promedio,
-- aplica los datos nuevos, y actualiza el gasto ligado + el movimiento del ledger.

-- El monitor necesita leer las compras para poder editarlas desde "Compras y Gastos".
drop policy if exists inventory_purchases_monitor_select on public.inventory_purchases;
create policy inventory_purchases_monitor_select on public.inventory_purchases
  for select to authenticated using (public.is_owner_or_monitor());

-- Helper interno: quita del material el efecto de una compra (existencia y costo promedio).
create or replace function public._revert_purchase_effect(p_item_id uuid, p_qty_base numeric, p_total numeric)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_stock numeric; v_cost numeric; v_new_stock numeric; v_new_cost numeric;
begin
  select coalesce(current_stock,0), coalesce(current_cost,0) into v_stock, v_cost
    from public.inventory_items where id = p_item_id for update;
  v_new_stock := v_stock - p_qty_base;
  if v_new_stock > 0 then
    v_new_cost := greatest(((v_stock * v_cost) - p_total) / v_new_stock, 0);
  else
    v_new_cost := v_cost;  -- sin existencia positiva no se puede recalcular: se conserva
  end if;
  update public.inventory_items
    set current_stock = v_new_stock, current_cost = round(v_new_cost, 6)
    where id = p_item_id;
end;
$function$;
revoke all on function public._revert_purchase_effect(uuid, numeric, numeric) from public, anon, authenticated;

-- Editar compra (se identifica por el gasto ligado, que es lo que se ve en la tabla).
create or replace function public.update_purchase(
  p_expense_id uuid, p_item_id uuid, p_purchase_qty numeric, p_purchase_unit text,
  p_total_cost numeric, p_supplier_id uuid default null, p_purchased_at date default null
)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_old public.inventory_purchases%rowtype;
  v_item public.inventory_items%rowtype; v_pu public.units%rowtype; v_bu public.units%rowtype;
  v_qty_base numeric; v_total numeric; v_unit_cost numeric; v_unit_cost_base numeric;
  v_new_stock numeric; v_new_cost numeric; v_supplier text;
  v_date date;
begin
  if not public.is_owner_or_monitor() then
    raise exception 'No autorizado para editar compras';
  end if;
  if not (p_purchase_qty > 0) then raise exception 'La cantidad debe ser mayor que cero'; end if;
  if not (p_total_cost >= 0) then raise exception 'El costo total no puede ser negativo'; end if;

  select * into v_old from public.inventory_purchases where expense_id = p_expense_id for update;
  if not found then raise exception 'Compra no encontrada'; end if;
  v_date := coalesce(p_purchased_at, v_old.purchased_at);

  -- 1) Revertir la compra original
  perform public._revert_purchase_effect(v_old.item_id, v_old.qty_base, v_old.total_cost);

  -- 2) Calcular la compra nueva (misma lógica que apply_purchase)
  select * into v_item from public.inventory_items where id = p_item_id for update;
  if not found then raise exception 'Ingrediente no encontrado'; end if;
  if v_item.base_unit is null then
    raise exception 'El material "%" no tiene unidad configurada', v_item.name;
  end if;
  select * into v_bu from public.units where code = v_item.base_unit;
  if p_purchase_unit = 'paquete' then
    if v_bu.family <> 'pieza' then raise exception 'La unidad "paquete" solo aplica a materiales por pieza'; end if;
    if coalesce(v_item.pack_size, 0) <= 0 then
      raise exception 'Define "piezas por paquete" en el material "%" para comprar por paquete', v_item.name;
    end if;
    v_qty_base := p_purchase_qty * v_item.pack_size;
  else
    select * into v_pu from public.units where code = p_purchase_unit;
    if not found then raise exception 'Unidad de compra inválida: %', p_purchase_unit; end if;
    if v_pu.family <> v_bu.family then
      raise exception 'La unidad de compra (%) no es compatible con la del material (%)', p_purchase_unit, v_item.base_unit;
    end if;
    v_qty_base := p_purchase_qty * (v_pu.to_base_factor / v_bu.to_base_factor);
  end if;
  v_total := round(p_total_cost, 4);
  v_unit_cost := round(v_total / p_purchase_qty, 4);
  v_unit_cost_base := case when v_qty_base = 0 then 0 else v_total / v_qty_base end;

  v_new_stock := coalesce(v_item.current_stock, 0) + v_qty_base;
  if coalesce(v_item.current_stock, 0) <= 0 then
    v_new_cost := v_unit_cost_base;
  else
    v_new_cost := ((v_item.current_stock * coalesce(v_item.current_cost,0)) + v_total) / v_new_stock;
  end if;
  update public.inventory_items set current_stock = v_new_stock, current_cost = round(v_new_cost, 6)
    where id = p_item_id;

  if p_supplier_id is not null then
    select name into v_supplier from public.suppliers where id = p_supplier_id;
  end if;

  -- 3) Actualizar compra, movimiento y gasto ligado
  update public.inventory_purchases set
    item_id = p_item_id, purchase_qty = p_purchase_qty, purchase_unit = p_purchase_unit,
    unit_cost = v_unit_cost, total_cost = v_total, qty_base = v_qty_base,
    unit_cost_base = v_unit_cost_base, supplier = v_supplier, supplier_id = p_supplier_id,
    purchased_at = v_date
  where id = v_old.id;

  update public.inventory_movements set
    item_id = p_item_id, qty_base = v_qty_base, unit_cost_base = v_unit_cost_base,
    note = coalesce(note || ' · ', '') || 'Editada ' || to_char(now() at time zone 'America/Tijuana', 'YYYY-MM-DD HH24:MI')
  where ref_type = 'purchase' and ref_id = v_old.id;

  update public.expenses set
    category = coalesce(v_item.accounting_category, 'Costo de venta'),
    description = 'Compra: ' || v_item.name || coalesce(' — ' || v_supplier, ''),
    amount = v_total, date = v_date
  where id = p_expense_id;

  return v_old.id;
end;
$function$;
grant execute on function public.update_purchase(uuid, uuid, numeric, text, numeric, uuid, date) to authenticated;

-- Eliminar compra: revierte inventario y borra movimiento, compra y gasto.
create or replace function public.delete_purchase(p_expense_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare v_old public.inventory_purchases%rowtype;
begin
  if not public.is_owner_or_monitor() then
    raise exception 'No autorizado para eliminar compras';
  end if;
  select * into v_old from public.inventory_purchases where expense_id = p_expense_id for update;
  if not found then raise exception 'Compra no encontrada'; end if;
  perform public._revert_purchase_effect(v_old.item_id, v_old.qty_base, v_old.total_cost);
  delete from public.inventory_movements where ref_type = 'purchase' and ref_id = v_old.id;
  delete from public.inventory_purchases where id = v_old.id;
  delete from public.expenses where id = p_expense_id;
end;
$function$;
grant execute on function public.delete_purchase(uuid) to authenticated;
