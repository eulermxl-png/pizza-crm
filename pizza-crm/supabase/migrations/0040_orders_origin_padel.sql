-- Permite el origen 'padel' (agregado en el frontend). Aditivo: no altera datos existentes.
alter table public.orders drop constraint if exists orders_origin_check;
alter table public.orders add constraint orders_origin_check
  check (origin = any (array['walk_in','phone','delivery_app','goat','padel']));
