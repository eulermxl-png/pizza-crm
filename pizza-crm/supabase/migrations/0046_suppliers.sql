-- Catálogo de proveedores + enlace en compras para análisis de gasto por proveedor.
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists suppliers_name_lower_idx on public.suppliers (lower(name));

alter table public.suppliers enable row level security;
drop policy if exists suppliers_read on public.suppliers;
create policy suppliers_read on public.suppliers for select to authenticated using (true);
drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers for all
  to authenticated using (public.is_owner()) with check (public.is_owner());

alter table public.inventory_purchases add column if not exists supplier_id uuid references public.suppliers(id);
create index if not exists inventory_purchases_supplier_idx on public.inventory_purchases(supplier_id);

-- apply_purchase ahora acepta el proveedor por id (y deriva el nombre si hace falta).
drop function if exists public.apply_purchase(uuid,numeric,text,numeric,text,date,text,boolean);
create or replace function public.apply_purchase(
  p_item_id uuid,
  p_purchase_qty numeric,
  p_purchase_unit text,
  p_total_cost numeric,
  p_supplier text default null,
  p_purchased_at date default null,
  p_notes text default null,
  p_create_expense boolean default true,
  p_supplier_id uuid default null
)
 returns uuid
 language plpgsql
as $function$
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
  v_unit_cost numeric;
  v_supplier text := p_supplier;
  v_date date := coalesce(p_purchased_at, (now() at time zone 'America/Tijuana')::date);
begin
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
    if v_bu.family <> 'pieza' then
      raise exception 'La unidad "paquete" solo aplica a materiales por pieza';
    end if;
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
  if v_new_stock = 0 then
    v_new_cost := coalesce(v_item.current_cost, 0);
  else
    v_new_cost := ((coalesce(v_item.current_stock,0) * coalesce(v_item.current_cost,0)) + v_total) / v_new_stock;
  end if;

  if p_create_expense then
    insert into public.expenses (category, description, amount, date)
    values (
      coalesce(v_item.accounting_category, 'Costo de venta'),
      'Compra: ' || v_item.name || coalesce(' — ' || v_supplier, ''),
      v_total,
      v_date
    )
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

  update public.inventory_items
    set current_stock = v_new_stock, current_cost = round(v_new_cost, 6)
    where id = p_item_id;

  return v_purchase_id;
end;
$function$;
