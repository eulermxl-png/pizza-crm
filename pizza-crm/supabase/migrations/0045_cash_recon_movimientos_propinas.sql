-- Snapshot de retiros/abonos y propinas del día en el corte.
alter table public.cash_reconciliation
  add column if not exists cash_withdrawals numeric,
  add column if not exists cash_deposits numeric,
  add column if not exists tips_total numeric;
