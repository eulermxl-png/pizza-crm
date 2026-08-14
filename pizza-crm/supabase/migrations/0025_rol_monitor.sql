-- 0025: agregar 'monitor' a los roles permitidos en users
-- NOTA: esta migración YA fue aplicada en Supabase (2026-08-14). Copia para el repo — no re-ejecutar.
alter table public.users drop constraint users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('owner','cashier','kitchen','monitor'));
