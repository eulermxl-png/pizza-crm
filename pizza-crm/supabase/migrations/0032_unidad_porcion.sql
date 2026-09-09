-- 0032: Unidad "porción" para el rendimiento de recetas (cuenta como pieza). Aditiva.
-- Aplicada en Supabase (kbkdymufoqhgcarkjjar) el 2026-09-09.
insert into public.units (code, name, family, to_base_factor) values
  ('porcion', 'Porción', 'pieza', 1)
on conflict (code) do nothing;
