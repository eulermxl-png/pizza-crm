-- Propina (caja): amount in MXN, default 0 for legacy rows.
alter table public.orders
  add column if not exists tip numeric(10,2) not null default 0;

comment on column public.orders.tip is 'Propina cobrada con el pedido (MXN).';
