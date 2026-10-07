-- 0064_audit_dismissals.sql
-- Decisiones del agente de revisión: cuando alguien marca un aviso como "Está bien así",
-- se guarda aquí y el agente ya no lo vuelve a mostrar (en ningún dispositivo).
-- La llave identifica el caso concreto (tipo + gastos involucrados), así que un caso
-- nuevo parecido SÍ se vuelve a avisar. Idempotente.

create table if not exists public.audit_dismissals (
  key text primary key,                 -- p. ej. 'duplicado:<id1>,<id2>' o 'ia:<id>'
  kind text not null,
  expense_ids uuid[] not null default '{}',
  title text,
  detail text,
  dismissed_by uuid references public.users(id) default auth.uid(),
  dismissed_at timestamptz not null default now()
);

alter table public.audit_dismissals enable row level security;

drop policy if exists audit_dismissals_select on public.audit_dismissals;
create policy audit_dismissals_select on public.audit_dismissals
  for select to authenticated using (public.is_owner_or_monitor());

drop policy if exists audit_dismissals_insert on public.audit_dismissals;
create policy audit_dismissals_insert on public.audit_dismissals
  for insert to authenticated with check (public.is_owner_or_monitor());

drop policy if exists audit_dismissals_update on public.audit_dismissals;
create policy audit_dismissals_update on public.audit_dismissals
  for update to authenticated using (public.is_owner_or_monitor()) with check (public.is_owner_or_monitor());

drop policy if exists audit_dismissals_delete on public.audit_dismissals;
create policy audit_dismissals_delete on public.audit_dismissals
  for delete to authenticated using (public.is_owner_or_monitor());
