-- Entregas de mayoreo devueltas/perdidas se marcan como merma (pérdida, no cobrable).
alter table public.wholesale_sales
  add column if not exists merma boolean not null default false,
  add column if not exists merma_at timestamptz;
