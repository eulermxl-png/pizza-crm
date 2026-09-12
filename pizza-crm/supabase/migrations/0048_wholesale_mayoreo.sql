-- Mayoreo B2B: venta de pizzas congeladas a clientes (Sume = primer cliente).
create table if not exists public.wholesale_clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists wholesale_clients_name_lower_idx on public.wholesale_clients (lower(name));

create table if not exists public.wholesale_sales (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.wholesale_clients(id),
  sold_at date not null default (now() at time zone 'America/Tijuana')::date,
  total numeric not null default 0,
  paid boolean not null default false,
  paid_at timestamptz,
  notes text,
  inventory_applied boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists wholesale_sales_client_idx on public.wholesale_sales(client_id);
create index if not exists wholesale_sales_date_idx on public.wholesale_sales(sold_at);

create table if not exists public.wholesale_sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.wholesale_sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  size text not null default 'standard',
  quantity integer not null check (quantity > 0),
  unit_price numeric not null default 0
);
create index if not exists wholesale_sale_items_sale_idx on public.wholesale_sale_items(sale_id);

alter table public.wholesale_clients enable row level security;
alter table public.wholesale_sales enable row level security;
alter table public.wholesale_sale_items enable row level security;

drop policy if exists wholesale_clients_owner on public.wholesale_clients;
create policy wholesale_clients_owner on public.wholesale_clients for all
  to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists wholesale_sales_owner on public.wholesale_sales;
create policy wholesale_sales_owner on public.wholesale_sales for all
  to authenticated using (public.is_owner()) with check (public.is_owner());
drop policy if exists wholesale_sale_items_owner on public.wholesale_sale_items;
create policy wholesale_sale_items_owner on public.wholesale_sale_items for all
  to authenticated using (public.is_owner()) with check (public.is_owner());

create or replace function public.apply_wholesale_consumption(p_sale_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  oi record; u record; it record; pm record;
  v_recipe uuid; v_qb numeric; v_applied boolean;
begin
  if not public.is_owner() then raise exception 'No autorizado'; end if;
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

insert into public.wholesale_clients(name)
select 'Sume' where not exists (select 1 from public.wholesale_clients where lower(name) = lower('Sume'));
