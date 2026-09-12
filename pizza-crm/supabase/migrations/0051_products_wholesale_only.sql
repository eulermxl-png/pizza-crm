-- Canal del producto: "solo mayoreo" (pizzas congeladas). No aparece en el POS.
alter table public.products
  add column if not exists wholesale_only boolean not null default false;
create index if not exists products_wholesale_only_idx on public.products(wholesale_only);
