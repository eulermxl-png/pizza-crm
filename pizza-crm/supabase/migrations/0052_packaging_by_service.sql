-- Empaque por tipo de servicio (comer aquí vs para llevar). No va en la receta.
alter table public.orders add column if not exists takeout boolean;

create table if not exists public.packaging_materials (
  id uuid primary key default gen_random_uuid(),
  takeout boolean not null,                 -- true = para llevar, false = comer aquí
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  qty numeric not null check (qty > 0),
  unit text not null,
  per_unit text not null default 'order' check (per_unit in ('pizza','order')),
  created_at timestamptz not null default now()
);
create index if not exists packaging_materials_takeout_idx on public.packaging_materials(takeout);

alter table public.packaging_materials enable row level security;
drop policy if exists packaging_materials_read on public.packaging_materials;
create policy packaging_materials_read on public.packaging_materials for select
  to authenticated using (true);
drop policy if exists packaging_materials_write on public.packaging_materials;
create policy packaging_materials_write on public.packaging_materials for all
  to authenticated using (public.is_owner()) with check (public.is_owner());

-- consume_order += bloque de empaque según orders.takeout (por pizza / por orden).
create or replace function public.consume_order(p_order_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  oi record; u record; it record; pm record; ex record; pk record;
  v_recipe uuid; v_recipe_r uuid; v_left uuid; v_right uuid;
  v_qb numeric; v_pizzas numeric; v_takeout boolean; v_factor numeric;
begin
  for oi in select * from public.order_items where order_id = p_order_id loop
    if oi.half_flavors is not null and jsonb_typeof(oi.half_flavors) = 'array'
       and jsonb_array_length(oi.half_flavors) = 2 then
      v_left := (oi.half_flavors->>0)::uuid; v_right := (oi.half_flavors->>1)::uuid;
      v_recipe := public.recipe_for_product(v_left, oi.size);
      v_recipe_r := public.recipe_for_product(v_right, oi.size);
      if v_recipe is not null then
        for u in select ru.mat_id, sum(ru.qb) qb from public.recipe_usage_role(v_recipe, coalesce(oi.quantity,1), 'base') ru group by ru.mat_id loop
          perform public.apply_consumption(u.mat_id, u.qb, p_order_id); end loop;
        for u in select ru.mat_id, sum(ru.qb) qb from public.recipe_usage_role(v_recipe, coalesce(oi.quantity,1) * 0.5, 'topping') ru group by ru.mat_id loop
          perform public.apply_consumption(u.mat_id, u.qb, p_order_id); end loop;
      end if;
      if v_recipe_r is not null then
        for u in select ru.mat_id, sum(ru.qb) qb from public.recipe_usage_role(v_recipe_r, coalesce(oi.quantity,1) * 0.5, 'topping') ru group by ru.mat_id loop
          perform public.apply_consumption(u.mat_id, u.qb, p_order_id); end loop;
      end if;
    else
      v_recipe := public.recipe_for_product(oi.product_id, oi.size);
      if v_recipe is not null then
        for u in select ru.mat_id, sum(ru.qb) qb from public.recipe_usage(v_recipe, coalesce(oi.quantity,1)) ru group by ru.mat_id loop
          perform public.apply_consumption(u.mat_id, u.qb, p_order_id); end loop;
      else
        for pm in select item_id, qty, unit from public.product_materials
          where product_id = oi.product_id and (size is not distinct from oi.size
            or (size is null and not exists (select 1 from public.product_materials pm2
              where pm2.product_id = oi.product_id and pm2.size is not distinct from oi.size))) loop
          select base_unit, piece_size into it from public.inventory_items where id = pm.item_id;
          if not found or it.base_unit is null then continue; end if;
          v_qb := public.convert_to_base(pm.qty * coalesce(oi.quantity, 1), pm.unit, it.base_unit, it.piece_size);
          if v_qb is null then continue; end if;
          perform public.apply_consumption(pm.item_id, v_qb, p_order_id);
        end loop;
      end if;
    end if;
    if oi.customizations is not null and jsonb_typeof(oi.customizations) = 'array' then
      for ex in select cm.item_id, cm.qty, cm.unit
        from jsonb_array_elements_text(oi.customizations) as cn(name)
        join public.customization_options co on co.name = cn.name
        join public.customization_materials cm on cm.customization_id = co.id loop
        select base_unit, piece_size into it from public.inventory_items where id = ex.item_id;
        if not found or it.base_unit is null then continue; end if;
        v_qb := public.convert_to_base(ex.qty * coalesce(oi.quantity, 1), ex.unit, it.base_unit, it.piece_size);
        if v_qb is null then continue; end if;
        perform public.apply_consumption(ex.item_id, v_qb, p_order_id);
      end loop;
    end if;
  end loop;

  -- Empaque por tipo de servicio.
  select coalesce(sum(oi2.quantity), 0) into v_pizzas
  from public.order_items oi2 join public.products p on p.id = oi2.product_id
  where oi2.order_id = p_order_id and p.category ~* 'pizza';
  select takeout into v_takeout from public.orders where id = p_order_id;
  for pk in select item_id, qty, unit, per_unit from public.packaging_materials
    where takeout = coalesce(v_takeout, false) loop
    v_factor := case when pk.per_unit = 'pizza' then v_pizzas else 1 end;
    if v_factor <= 0 then continue; end if;
    select base_unit, piece_size into it from public.inventory_items where id = pk.item_id;
    if not found or it.base_unit is null then continue; end if;
    v_qb := public.convert_to_base(pk.qty * v_factor, pk.unit, it.base_unit, it.piece_size);
    if v_qb is null then continue; end if;
    perform public.apply_consumption(pk.item_id, v_qb, p_order_id);
  end loop;
end $function$;
