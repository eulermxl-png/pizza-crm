-- Initial schema scaffold for Pizza CRM.
create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null check (role in ('owner', 'cashier', 'kitchen')),
  email text not null unique
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  image_url text,
  prices jsonb not null default '{}'::jsonb,
  active boolean not null default true
);

create table if not exists public.customization_options (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  origin text not null check (origin in ('walk_in', 'phone')),
  customer_name text,
  customer_phone text,
  status text not null default 'pending',
  payment_method text,
  discount numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  size text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(10,2) not null,
  customizations jsonb not null default '[]'::jsonb
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  description text not null,
  amount numeric(10,2) not null,
  date date not null
);

create table if not exists public.cash_reconciliation (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  cash_total numeric(10,2) not null,
  terminal_total numeric(10,2) not null,
  system_total numeric(10,2) not null,
  difference numeric(10,2) not null
);

alter table public.users enable row level security;
alter table public.products enable row level security;
alter table public.customization_options enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.expenses enable row level security;
alter table public.cash_reconciliation enable row level security;
