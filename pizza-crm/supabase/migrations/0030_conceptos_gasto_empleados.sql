-- 0030: Catálogo de conceptos de gasto + empleados (registrar gastos por selección)
-- Aditiva. Aplicada en Supabase (kbkdymufoqhgcarkjjar) el 2026-09-08.

create table if not exists public.expense_concepts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  accounting_category text not null default 'Gasto de operación',
  is_payroll boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.expense_concepts enable row level security;
alter table public.employees enable row level security;
create policy expense_concepts_owner_all on public.expense_concepts for all using (is_owner()) with check (is_owner());
create policy expense_concepts_select on public.expense_concepts for select using (auth.uid() is not null);
create policy employees_owner_all on public.employees for all using (is_owner()) with check (is_owner());
create policy employees_select on public.employees for select using (auth.uid() is not null);
grant select, insert, update, delete on public.expense_concepts to authenticated;
grant select, insert, update, delete on public.employees to authenticated;
insert into public.expense_concepts (name, accounting_category, is_payroll, sort_order) values
  ('Nómina', 'Gasto de operación', true, 10),
  ('Luz (CFE)', 'Gasto de operación', false, 20),
  ('Agua', 'Gasto de operación', false, 30),
  ('Renta', 'Gasto de operación', false, 40),
  ('Internet / Teléfono', 'Gasto de operación', false, 50),
  ('Mantenimiento', 'Gasto de operación', false, 60),
  ('Otros servicios', 'Gasto de operación', false, 70);
