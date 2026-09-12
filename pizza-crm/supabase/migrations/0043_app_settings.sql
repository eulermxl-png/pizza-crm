-- Ajustes globales de la app (los edita el admin/owner). Incluye el fondo de caja objetivo.
create table if not exists public.app_settings (
  key text primary key,
  num_value numeric,
  txt_value text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select to authenticated using (true);

drop policy if exists app_settings_write on public.app_settings;
create policy app_settings_write on public.app_settings
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

insert into public.app_settings(key, num_value) values ('cash_fund_target', 700)
  on conflict (key) do nothing;
