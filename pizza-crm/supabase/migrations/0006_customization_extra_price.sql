-- Optional surcharge per customization (e.g. extra cheese).

alter table public.customization_options
  add column if not exists extra_price numeric(10, 2) not null default 0;
