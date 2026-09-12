-- Extiende consume_order para descontar tambien los extras (customizations) ligados a inventario.
create or replace function public.consume_order(p_order_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  oi record; u record; it record; pm record; ex record;
  v_recipe uuid; v_recipe_r uuid;
  v_left uuid; v_right uuid;
  v_qb numeric;
begin
  for oi in select * from public.order_items where order_id = p_order_id loop
    if oi.half_flavors is not null
       and jsonb_typeof(oi.half_flavors) = 'array'
       and jsonb_array_length(oi.half_flavors) = 2 then
      v_left  := (oi.half_flavors->>0)::uuid;
      v_right := (oi.half_flavors->>1)::uuid;
      v_recipe   := public.recipe_for_product(v_left, oi.size);
      v_recipe_r := public.recipe_for_product(v_right, oi.size);
      if v_recipe is not null then
        for u in select ru.mat_id, sum(ru.qb) qb
                 from public.recipe_usage_role(v_recipe, coalesce(oi.quantity,1), 'base') ru
                 group by ru.mat_id loop
          perform public.apply_consumption(u.mat_id, u.qb, p_order_id);
        end loop;
        for u in select ru.mat_id, sum(ru.qb) qb
                 from public.recipe_usage_role(v_recipe, coalesce(oi.quantity,1) * 0.5, 'topping') ru
                 group by ru.mat_id loop
          perform public.apply_consumption(u.mat_id, u.qb, p_order_id);
        end loop;
      end if;
      if v_recipe_r is not null then
        for u in select ru.mat_id, sum(ru.qb) qb
                 from public.recipe_usage_role(v_recipe_r, coalesce(oi.quantity,1) * 0.5, 'topping') ru
                 group by ru.mat_id loop
          perform public.apply_consumption(u.mat_id, u.qb, p_order_id);
        end loop;
      end if;
    else
      v_recipe := public.recipe_for_product(oi.product_id, oi.size);
      if v_recipe is not null then
        for u in select ru.mat_id, sum(ru.qb) qb
                 from public.recipe_usage(v_recipe, coalesce(oi.quantity,1)) ru
                 group by ru.mat_id loop
          perform public.apply_consumption(u.mat_id, u.qb, p_order_id);
        end loop;
      else
        for pm in
          select item_id, qty, unit
          from public.product_materials
          where product_id = oi.product_id
            and (
              size is not distinct from oi.size
              or (
                size is null
                and not exists (
                  select 1 from public.product_materials pm2
                  where pm2.product_id = oi.product_id
                    and pm2.size is not distinct from oi.size
                )
              )
            )
        loop
          select base_unit, piece_size into it
          from public.inventory_items where id = pm.item_id;
          if not found or it.base_unit is null then continue; end if;
          v_qb := public.convert_to_base(
            pm.qty * coalesce(oi.quantity, 1), pm.unit, it.base_unit, it.piece_size);
          if v_qb is null then continue; end if;
          perform public.apply_consumption(pm.item_id, v_qb, p_order_id);
        end loop;
      end if;
    end if;

    -- Extras (customizations) ligados a inventario: aplica a cualquier item.
    if oi.customizations is not null and jsonb_typeof(oi.customizations) = 'array' then
      for ex in
        select cm.item_id, cm.qty, cm.unit
        from jsonb_array_elements_text(oi.customizations) as cn(name)
        join public.customization_options co on co.name = cn.name
        join public.customization_materials cm on cm.customization_id = co.id
      loop
        select base_unit, piece_size into it
        from public.inventory_items where id = ex.item_id;
        if not found or it.base_unit is null then continue; end if;
        v_qb := public.convert_to_base(
          ex.qty * coalesce(oi.quantity, 1), ex.unit, it.base_unit, it.piece_size);
        if v_qb is null then continue; end if;
        perform public.apply_consumption(ex.item_id, v_qb, p_order_id);
      end loop;
    end if;
  end loop;
end $function$;
