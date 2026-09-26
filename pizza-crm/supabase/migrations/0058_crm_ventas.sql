-- 0058_crm_ventas.sql
-- Perfil CRM: rol `ventas`, pipeline de clientes de mayoreo, bitácora de actividades,
-- y RPCs para que ventas registre ventas y cobros de mayoreo (solo owner corrige/elimina).

-- 1) Rol
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role = any (array['owner','cashier','kitchen','monitor','ventas']));

create or replace function public.is_owner_or_ventas()
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select exists (select 1 from public.users u
    where u.id = auth.uid() and u.role in ('owner','ventas'));
$function$;

-- 2) Pipeline en wholesale_clients
alter table public.wholesale_clients
  add column if not exists status text not null default 'prospecto',
  add column if not exists business_type text,
  add column if not exists phone text,
  add column if not exists source text,
  add column if not exists agreed_price numeric check (agreed_price is null or agreed_price >= 0),
  add column if not exists expected_weekly_qty integer check (expected_weekly_qty is null or expected_weekly_qty >= 0),
  add column if not exists next_follow_up date,
  add column if not exists assigned_to uuid references public.users(id),
  add column if not exists lost_reason text,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'wholesale_clients_status_check') then
    alter table public.wholesale_clients add constraint wholesale_clients_status_check
      check (status in ('prospecto','contactado','muestra','negociando','activo','pausado','perdido'));
  end if;
end $$;

-- Clientes existentes con ventas → activos
update public.wholesale_clients c set status = 'activo'
where status = 'prospecto' and exists (select 1 from public.wholesale_sales s where s.client_id = c.id);
-- Sume (cliente real) → activo
update public.wholesale_clients set status = 'activo' where lower(name) = 'sume' and status = 'prospecto';

create index if not exists wholesale_clients_status_idx on public.wholesale_clients(status);
create index if not exists wholesale_clients_follow_idx on public.wholesale_clients(next_follow_up);

-- 3) Bitácora
create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.wholesale_clients(id) on delete cascade,
  type text not null check (type in ('visita','llamada','whatsapp','muestra','nota')),
  happened_at date not null default (now() at time zone 'America/Tijuana')::date,
  result text,
  next_step text,
  next_follow_up date,
  created_by uuid default auth.uid() references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists crm_activities_client_idx on public.crm_activities(client_id, happened_at desc);

create or replace function public.trg_crm_activity_after()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  update public.wholesale_clients set
    next_follow_up = new.next_follow_up,
    status = case
      when new.type = 'muestra' and status in ('prospecto','contactado') then 'muestra'
      when new.type in ('visita','llamada','whatsapp') and status = 'prospecto' then 'contactado'
      else status end,
    updated_at = now()
  where id = new.client_id;
  return null;
end;
$function$;
drop trigger if exists crm_activity_after on public.crm_activities;
create trigger crm_activity_after after insert on public.crm_activities
  for each row execute function public.trg_crm_activity_after();

-- Venta a un cliente no activo lo pasa a activo
create or replace function public.trg_wholesale_sale_activate()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  update public.wholesale_clients set status = 'activo', updated_at = now()
  where id = new.client_id and status <> 'activo';
  return null;
end;
$function$;
drop trigger if exists wholesale_sale_activate on public.wholesale_sales;
create trigger wholesale_sale_activate after insert on public.wholesale_sales
  for each row execute function public.trg_wholesale_sale_activate();

-- 4) RLS
alter table public.crm_activities enable row level security;
drop policy if exists crm_activities_owner on public.crm_activities;
create policy crm_activities_owner on public.crm_activities for all to authenticated
  using (public.is_owner()) with check (public.is_owner());
drop policy if exists crm_activities_ventas_select on public.crm_activities;
create policy crm_activities_ventas_select on public.crm_activities for select to authenticated
  using (public.is_owner_or_ventas());
drop policy if exists crm_activities_ventas_insert on public.crm_activities;
create policy crm_activities_ventas_insert on public.crm_activities for insert to authenticated
  with check (public.is_owner_or_ventas() and created_by = auth.uid());

drop policy if exists wholesale_clients_ventas_select on public.wholesale_clients;
create policy wholesale_clients_ventas_select on public.wholesale_clients for select to authenticated
  using (public.is_owner_or_ventas());
drop policy if exists wholesale_clients_ventas_insert on public.wholesale_clients;
create policy wholesale_clients_ventas_insert on public.wholesale_clients for insert to authenticated
  with check (public.is_owner_or_ventas());
drop policy if exists wholesale_clients_ventas_update on public.wholesale_clients;
create policy wholesale_clients_ventas_update on public.wholesale_clients for update to authenticated
  using (public.is_owner_or_ventas()) with check (public.is_owner_or_ventas());

drop policy if exists wholesale_sales_ventas_select on public.wholesale_sales;
create policy wholesale_sales_ventas_select on public.wholesale_sales for select to authenticated
  using (public.is_owner_or_ventas());
drop policy if exists wholesale_sale_items_ventas_select on public.wholesale_sale_items;
create policy wholesale_sale_items_ventas_select on public.wholesale_sale_items for select to authenticated
  using (public.is_owner_or_ventas());
drop policy if exists wholesale_payments_ventas_select on public.wholesale_payments;
create policy wholesale_payments_ventas_select on public.wholesale_payments for select to authenticated
  using (public.is_owner_or_ventas());

drop policy if exists products_ventas_select on public.products;
create policy products_ventas_select on public.products for select to authenticated
  using (active = true and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'ventas'));

-- 5) Consumo de mayoreo: también lo puede disparar ventas (vía RPC)
create or replace function public.apply_wholesale_consumption(p_sale_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  oi record; u record; it record; pm record;
  v_recipe uuid; v_qb numeric; v_applied boolean;
begin
  if not public.is_owner_or_ventas() then raise exception 'No autorizado'; end if;
  select inventory_applied into v_applied from public.wholesale_sales where id = p_sale_id;
  if v_applied is null then raise exception 'Venta no encontrada'; end if;
  if v_applied then return; end if;
  for oi in select * from public.wholesale_sale_items where sale_id = p_sale_id loop
    v_recipe := public.recipe_for_product(oi.product_id, oi.size);
    if v_recipe is not null then
      for u in select ru.mat_id, sum(ru.qb) qb
               from public.recipe_usage(v_recipe, coalesce(oi.quantity,1)) ru group by ru.mat_id loop
        insert into public.inventory_movements
          (item_id, type, qty_base, unit_cost_base, ref_type, ref_id, created_by, note)
        values (u.mat_id, 'consumption', -u.qb,
          coalesce((select current_cost from public.inventory_items where id = u.mat_id), 0),
          'wholesale', p_sale_id, auth.uid(), 'Mayoreo');
        update public.inventory_items set current_stock = coalesce(current_stock,0) - u.qb where id = u.mat_id;
      end loop;
    else
      for pm in select item_id, qty, unit from public.product_materials
        where product_id = oi.product_id
          and (size is not distinct from oi.size
            or (size is null and not exists (select 1 from public.product_materials pm2
              where pm2.product_id = oi.product_id and pm2.size is not distinct from oi.size))) loop
        select base_unit, piece_size into it from public.inventory_items where id = pm.item_id;
        if not found or it.base_unit is null then continue; end if;
        v_qb := public.convert_to_base(pm.qty * coalesce(oi.quantity,1), pm.unit, it.base_unit, it.piece_size);
        if v_qb is null then continue; end if;
        insert into public.inventory_movements
          (item_id, type, qty_base, unit_cost_base, ref_type, ref_id, created_by, note)
        values (pm.item_id, 'consumption', -v_qb,
          coalesce((select current_cost from public.inventory_items where id = pm.item_id), 0),
          'wholesale', p_sale_id, auth.uid(), 'Mayoreo');
        update public.inventory_items set current_stock = coalesce(current_stock,0) - v_qb where id = pm.item_id;
      end loop;
    end if;
  end loop;
  update public.wholesale_sales set inventory_applied = true where id = p_sale_id;
end $function$;

-- 6) RPC: registrar venta de mayoreo (owner o ventas)
-- p_items: [{"product_id": uuid, "size": text, "quantity": int, "unit_price": numeric}]
create or replace function public.create_wholesale_sale(
  p_client_id uuid, p_sold_at date, p_items jsonb, p_notes text default null,
  p_paid_amount numeric default 0, p_method text default 'efectivo'
) returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_sale uuid; v_total numeric := 0; it jsonb;
begin
  if not public.is_owner_or_ventas() then raise exception 'No autorizado'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Agrega al menos un producto';
  end if;
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce((it->>'quantity')::int, 0) <= 0 then raise exception 'Cantidad inválida'; end if;
    if coalesce((it->>'unit_price')::numeric, -1) < 0 then raise exception 'Precio inválido'; end if;
    v_total := v_total + (it->>'quantity')::int * (it->>'unit_price')::numeric;
  end loop;

  insert into public.wholesale_sales (client_id, sold_at, total, notes, created_by)
  values (p_client_id, coalesce(p_sold_at, (now() at time zone 'America/Tijuana')::date),
    round(v_total, 2), nullif(btrim(coalesce(p_notes,'')), ''), auth.uid())
  returning id into v_sale;

  insert into public.wholesale_sale_items (sale_id, product_id, size, quantity, unit_price)
  select v_sale, (x->>'product_id')::uuid, coalesce(x->>'size','standard'),
         (x->>'quantity')::int, (x->>'unit_price')::numeric
  from jsonb_array_elements(p_items) x;

  perform public.apply_wholesale_consumption(v_sale);

  if coalesce(p_paid_amount, 0) > 0 then
    insert into public.wholesale_payments (client_id, sale_id, amount, paid_at, method, created_by)
    values (p_client_id, v_sale, round(p_paid_amount, 2),
      coalesce(p_sold_at, (now() at time zone 'America/Tijuana')::date), coalesce(p_method,'efectivo'), auth.uid());
  end if;
  return v_sale;
end;
$function$;
grant execute on function public.create_wholesale_sale(uuid, date, jsonb, text, numeric, text) to authenticated;

-- 7) RPC: registrar pago / anticipo (owner o ventas)
create or replace function public.add_wholesale_payment(
  p_client_id uuid, p_amount numeric, p_paid_at date default null, p_method text default 'efectivo',
  p_sale_id uuid default null, p_notes text default null
) returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare v_id uuid;
begin
  if not public.is_owner_or_ventas() then raise exception 'No autorizado'; end if;
  if not (p_amount > 0) then raise exception 'Monto inválido'; end if;
  if p_sale_id is not null and not exists
    (select 1 from public.wholesale_sales where id = p_sale_id and client_id = p_client_id) then
    raise exception 'La venta no pertenece a este cliente';
  end if;
  insert into public.wholesale_payments (client_id, sale_id, amount, paid_at, method, notes, created_by)
  values (p_client_id, p_sale_id, round(p_amount, 2),
    coalesce(p_paid_at, (now() at time zone 'America/Tijuana')::date), coalesce(p_method,'efectivo'),
    nullif(btrim(coalesce(p_notes,'')), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$;
grant execute on function public.add_wholesale_payment(uuid, numeric, date, text, uuid, text) to authenticated;

-- 8) Nombres del equipo comercial (para "responsable")
create or replace function public.crm_staff()
 returns table (id uuid, name text, role text) language sql stable security definer set search_path to 'public'
as $function$
  select u.id, coalesce(u.name, u.email), u.role from public.users u
  where u.role in ('owner','ventas') and public.is_owner_or_ventas()
  order by u.role desc, coalesce(u.name, u.email);
$function$;
grant execute on function public.crm_staff() to authenticated;
