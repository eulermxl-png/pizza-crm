-- Split payment amounts for caja vs terminal (BBVA); supports mixed payments.
alter table public.orders
  add column if not exists cash_amount numeric(10,2) not null default 0,
  add column if not exists card_amount numeric(10,2) not null default 0;

comment on column public.orders.cash_amount is 'Amount paid in cash (caja); for pure card orders use 0.';
comment on column public.orders.card_amount is 'Amount paid by card (terminal); reconciliation uses this sum across orders.';
