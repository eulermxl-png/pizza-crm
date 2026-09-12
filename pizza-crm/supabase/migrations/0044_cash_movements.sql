-- Retiros y abonos de caja durante el día (afectan el efectivo esperado del corte).
create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  kind text not null check (kind in ('retiro','abono')),
  amount numeric not null check (amount > 0),
  reason text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists cash_movements_date_idx on public.cash_movements(date);

alter table public.cash_movements enable row level security;

drop policy if exists cash_movements_read on public.cash_movements;
create policy cash_movements_read on public.cash_movements
  for select to authenticated using (true);

drop policy if exists cash_movements_write on public.cash_movements;
create policy cash_movements_write on public.cash_movements
  for all to authenticated using (true) with check (true);
