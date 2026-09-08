-- 0027: Categoría contable en ingredientes (Costo de venta / Gasto de operación)
-- Aditiva. La categoría de cocina (inventory_items.category) NO cambia; esto es otro eje.
-- Aplicada en Supabase (kbkdymufoqhgcarkjjar) el 2026-08-29. Copia para el repo.

alter table public.inventory_items
  add column if not exists accounting_category text not null default 'Costo de venta';

update public.inventory_items
  set accounting_category = 'Gasto de operación'
  where category = 'Empaque y desechables'
     or name in ('Gas', 'Tubo para la parte de afuera');

-- apply_purchase: el gasto usa la categoría contable del ingrediente (ver 0026 para el resto).
-- Redefinición completa en la migración aplicada; aquí se documenta el cambio clave:
--   insert into public.expenses (category, ...) values (coalesce(v_item.accounting_category,'Costo de venta'), ...)
