-- 0024: Perfil de monitoreo del saludo en caja
-- NOTA: esta migración YA fue aplicada en Supabase (2026-08-14). Copia para el repo — no re-ejecutar.

-- Campos de saludo en orders
alter table public.orders
  add column greeting_status text check (greeting_status in ('given','not_given')),
  add column greeting_marked_at timestamptz,
  add column greeting_marked_by uuid references public.users(id);

-- El rol 'monitor' puede ver órdenes, items, productos y mesas
create policy orders_monitor_select on public.orders
  for select using (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'monitor'
  ));

create policy order_items_monitor_select on public.order_items
  for select using (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'monitor'
  ));

create policy products_monitor_select on public.products
  for select using (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'monitor'
  ));

create policy tables_monitor_select on public.tables
  for select using (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'monitor'
  ));

-- El monitor puede actualizar órdenes...
create policy orders_monitor_update on public.orders
  for update using (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'monitor'
  )) with check (exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'monitor'
  ));

-- ...pero un trigger garantiza que SOLO pueda tocar los campos del saludo
create or replace function public.enforce_monitor_greeting_only()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.role = 'monitor'
  ) then
    if (to_jsonb(new) - 'greeting_status' - 'greeting_marked_at' - 'greeting_marked_by')
       is distinct from
       (to_jsonb(old) - 'greeting_status' - 'greeting_marked_at' - 'greeting_marked_by') then
      raise exception 'El perfil de monitoreo solo puede modificar los campos del saludo';
    end if;
  end if;
  return new;
end;
$$;

create trigger orders_monitor_guard
  before update on public.orders
  for each row
  execute function public.enforce_monitor_greeting_only();
