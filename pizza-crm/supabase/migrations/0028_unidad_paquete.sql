-- 0028: Unidad "paquete" + piezas por paquete (para comprar por caja/paquete)
-- Aditiva. 'paquete' solo aplica a ingredientes con unidad base 'pza'.
-- Aplicada en Supabase (kbkdymufoqhgcarkjjar) el 2026-08-29. Copia para el repo.

alter table public.inventory_items
  add column if not exists pack_size numeric;  -- piezas por paquete

insert into public.units (code, name, family, to_base_factor) values
  ('paquete','Paquete','pieza',1)
on conflict (code) do nothing;

-- apply_purchase: rama para 'paquete' (usa pack_size). Ver definición completa aplicada en Supabase.
-- Clave: if p_purchase_unit = 'paquete' then v_qty_base := p_purchase_qty * v_item.pack_size;
