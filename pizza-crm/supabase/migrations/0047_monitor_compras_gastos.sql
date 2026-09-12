-- El perfil de monitoreo también puede registrar compras y gastos.
create or replace function public.is_owner_or_monitor()
 returns boolean
 language sql stable security definer set search_path to 'public'
as $function$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role in ('owner','monitor')
  );
$function$;

-- Gastos: el monitor los gestiona (registrar, ver, editar).
drop policy if exists expenses_monitor_all on public.expenses;
create policy expenses_monitor_all on public.expenses for all to authenticated
  using (public.is_owner_or_monitor()) with check (public.is_owner_or_monitor());

-- Ingredientes: el monitor puede verlos (para elegir en compras) y dar de alta.
drop policy if exists inventory_items_monitor_select on public.inventory_items;
create policy inventory_items_monitor_select on public.inventory_items for select to authenticated
  using (public.is_owner_or_monitor());
drop policy if exists inventory_items_monitor_insert on public.inventory_items;
create policy inventory_items_monitor_insert on public.inventory_items for insert to authenticated
  with check (public.is_owner_or_monitor());

-- Proveedores: el monitor puede dar de alta al vuelo.
drop policy if exists suppliers_monitor_insert on public.suppliers;
create policy suppliers_monitor_insert on public.suppliers for insert to authenticated
  with check (public.is_owner_or_monitor());

-- apply_purchase: SECURITY DEFINER con guard (owner o monitor). Cuerpo idéntico a 0046 + guard.
create or replace function public.apply_purchase(
  p_item_id uuid, p_purchase_qty numeric, p_purchase_unit text, p_total_cost numeric,
  p_supplier text default null, p_purchased_at date default null, p_notes text default null,
  p_create_expense boolean default true, p_supplier_id uuid default null
)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_item public.inventory_items%rowtype; v_pu public.units%rowtype; v_bu public.units%rowtype;
  v_qty_base numeric; v_total numeric; v_unit_cost_base numeric;
  v_new_stock numeric; v_new_cost numeric; v_expense_id uuid; v_purchase_id uuid; v_unit_cost numeric;
  v_supplier text := p_supplier;
  v_date date := coalesce(p_purchased_at, (now() at time zone 'America/Tijuana')::date);
begin
  if not public.is_owner_or_monitor() then
    raise exception 'No autorizado para registrar compras';
  end if;
  select * into v_item from public.inventory_items where id = p_item_id;
  if not found then raise exception 'Ingrediente no encontrado'; end if;
  if v_item.base_unit is null then
    raise exception 'El material "%" no tiene unidad configurada', v_item.name;
  end if;
  if p_supplier_id is not null and (v_supplier is null or btrim(v_supplier) = '') then
    select name into v_supplier from public.suppliers where id = p_supplier_id;
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
  v_unit_cost := case when p_purchase_qty = 0 then 0 else round(v_total / p_purchase_qty, 4) end;
  v_unit_cost_base := case when v_qty_base = 0 then 0 else v_total / v_qty_base end;
  v_new_stock := coalesce(v_item.current_stock, 0) + v_qty_base;
  if v_new_stock = 0 then v_new_cost := coalesce(v_item.current_cost, 0);
  else v_new_cost := ((coalesce(v_item.current_stock,0) * coalesce(v_item.current_cost,0)) + v_total) / v_new_stock; end if;
  if p_create_expense then
    insert into public.expenses (category, description, amount, date)
    values (coalesce(v_item.accounting_category, 'Costo de venta'),
      'Compra: ' || v_item.name || coalesce(' — ' || v_supplier, ''), v_total, v_date)
    returning id into v_expense_id;
  end if;
  insert into public.inventory_purchases
    (item_id, purchase_qty, purchase_unit, unit_cost, total_cost, qty_base, unit_cost_base,
     supplier, supplier_id, purchased_at, created_by, expense_id, notes)
  values
    (p_item_id, p_purchase_qty, p_purchase_unit, v_unit_cost, v_total, v_qty_base, v_unit_cost_base,
     v_supplier, p_supplier_id, v_date, auth.uid(), v_expense_id, p_notes)
  returning id into v_purchase_id;
  insert into public.inventory_movements
    (item_id, type, qty_base, unit_cost_base, ref_type, ref_id, created_by, note)
  values
    (p_item_id, 'purchase', v_qty_base, v_unit_cost_base, 'purchase', v_purchase_id, auth.uid(), p_notes);
  update public.inventory_items set current_stock = v_new_stock, current_cost = round(v_new_cost, 6)
    where id = p_item_id;
  return v_purchase_id;
end;
$function$;
