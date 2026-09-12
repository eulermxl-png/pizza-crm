-- Cobros parciales en mayoreo: monto cobrado acumulado por venta.
alter table public.wholesale_sales
  add column if not exists amount_paid numeric not null default 0;
-- Alinear ventas ya pagadas: monto cobrado = total.
update public.wholesale_sales set amount_paid = total where paid = true and amount_paid = 0;
