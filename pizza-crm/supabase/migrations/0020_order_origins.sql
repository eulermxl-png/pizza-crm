-- Extend order origin values for delivery apps and Goat.
alter table public.orders
  drop constraint if exists orders_origin_check;

alter table public.orders
  add constraint orders_origin_check
  check (origin in ('walk_in', 'phone', 'delivery_app', 'goat'));
