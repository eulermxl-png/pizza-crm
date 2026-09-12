-- Super admin: puede ver todas las pantallas (barra de perfiles) en producción.
alter table public.users add column if not exists super_admin boolean not null default false;

-- Habilitar para la cuenta de Euler.
update public.users set super_admin = true
where id = '1db30c89-4525-4aff-95aa-b3e724e021b4';
