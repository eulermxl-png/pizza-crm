-- 0062_length_units.sql
-- Unidades de longitud para insumos que se compran en rollo y se cortan según el uso
-- (papel encerado, aluminio, plástico). Unidad base: cm.
-- convert_to_base / apply_purchase / recetas / empaque ya trabajan por familia, así que
-- no requieren cambios. Idempotente.

alter table public.units drop constraint if exists units_family_check;
alter table public.units add constraint units_family_check
  check (family = any (array['peso','volumen','pieza','longitud']));

insert into public.units (code, name, family, to_base_factor) values
  ('cm',   'Centímetro', 'longitud', 1),
  ('m',    'Metro',      'longitud', 100),
  ('pulg', 'Pulgada',    'longitud', 2.54),
  ('pie',  'Pie',        'longitud', 30.48)
on conflict (code) do update
  set name = excluded.name, family = excluded.family, to_base_factor = excluded.to_base_factor;
