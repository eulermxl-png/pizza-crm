-- 0039: motivo del descuento de la orden (control en Reportes). Aditiva.
-- Aplicada en Supabase (kbkdymufoqhgcarkjjar).
alter table public.orders add column if not exists discount_reason text;
