-- 0038: Arqueo de efectivo en el corte de caja (fondo/caja chica). Aditiva.
-- Agrega el conteo físico de efectivo y el fondo al cierre. La diferencia de
-- tarjeta sigue en la columna 'difference'. Aplicada en Supabase.

alter table public.cash_reconciliation
  add column if not exists opening_float numeric not null default 0,
  add column if not exists cash_counted numeric,
  add column if not exists cash_difference numeric,
  add column if not exists created_at timestamptz not null default now();
