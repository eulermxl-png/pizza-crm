-- 0037: consume_order con fallback a enlace directo producto->material (Fase 5).
-- Si el producto del renglón tiene receta => descuenta por receta (como antes).
-- Si NO tiene receta => descuenta por product_materials (refrescos, complementos).
-- Half & half sin cambios. Sigue siendo SECURITY DEFINER y a prueba de fallos
-- (el trigger envuelve la llamada en un exception handler).
-- Aplicada en Supabase (kbkdymufoqhgcarkjjar).

create or replace function public.consume_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  oi record; u record; it record; pm record;
  v_recipe uuid; v_recipe_r uuid;
  v_left uuid; v_right uuid;
  v_qb numeric;
begin
  for oi in select * from public.order_items where order_id = p_order_id loop
    if oi.half_flavors is not null
       and jsonb_typeof(oi.half_flavors) = 'array'
       and jsonb_array_length(oi.half_flavors) = 2 then
      -- Mitad y mitad: base x1 del izquierdo + toppings x0.5 de cada sabor.
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
        -- Producto con receta: descuento por receta (con sub-recetas).
        for u in select ru.mat_id, sum(ru.qb) qb
                 from public.recipe_usage(v_recipe, coalesce(oi.quantity,1)) ru
                 group by ru.mat_id loop
          perform public.apply_consumption(u.mat_id, u.qb, p_order_id);
        end loop;
      else
        -- Producto SIN receta: fallback al enlace directo producto->material.
        -- Un mapeo de la talla exacta gana; si no hay ninguno, se usan los de
        -- talla nula (aplican a cualquier talla).
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
  end loop;
end $function$;
