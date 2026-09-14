-- 0055_apply_adjustment.sql
-- Ajuste manual de existencia (conteo inicial / correcciones). Solo owner.
-- Fija current_stock al valor dado y registra el movimiento (delta) en el ledger.
create or replace function public.apply_adjustment(
  p_item_id uuid,
  p_new_stock numeric,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current numeric;
  v_delta numeric;
begin
  if not public.is_owner() then
    raise exception 'No autorizado';
  end if;

  select current_stock into v_current
  from public.inventory_items
  where id = p_item_id
  for update;

  if v_current is null then
    v_current := 0;
  end if;

  v_delta := coalesce(p_new_stock, 0) - v_current;

  insert into public.inventory_movements
    (item_id, type, qty_base, ref_type, reason, created_by)
  values
    (p_item_id, 'adjustment', v_delta, 'adjustment',
     coalesce(p_reason, 'Ajuste manual'), auth.uid());

  update public.inventory_items
  set current_stock = coalesce(p_new_stock, 0)
  where id = p_item_id;
end;
$$;

grant execute on function public.apply_adjustment(uuid, numeric, text) to authenticated;
