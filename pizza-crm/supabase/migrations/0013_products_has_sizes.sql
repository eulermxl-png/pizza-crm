-- Optional product sizes (single-price products skip size UX for cashier/kitchen).
alter table public.products
  add column if not exists has_sizes boolean not null default true;
