-- Cash reconciliation notes (optional explanation when there is a difference).
-- No DB constraints change besides adding a nullable column.

alter table public.cash_reconciliation
  add column if not exists notes text;

