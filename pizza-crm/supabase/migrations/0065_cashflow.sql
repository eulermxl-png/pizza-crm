-- 0065_cashflow.sql
-- Flujo de efectivo (caja + banco como un solo dinero).
--   · cashflow_weekly(desde, hasta): entradas y salidas reales por semana (lunes) y concepto.
--   · cashflow_items: movimientos planeados que captura el equipo (renta, nómina, préstamos…)
--     para la proyección; pueden repetirse cada semana o cada mes.
--   · cashflow_settings: saldo inicial (fecha + monto) y comisiones de terminal y plataformas.
-- Retiros/abonos de caja (cash_movements) NO cuentan: son movimientos internos de efectivo;
-- los pagos reales ya están en expenses. Acceso: owner y monitor. Idempotente, sin DROP.

create table if not exists public.cashflow_settings (
  id int primary key default 1 check (id = 1),
  opening_date date,
  opening_amount numeric,
  card_fee_pct numeric not null default 0,      -- comisión de la terminal (% de lo cobrado con tarjeta)
  platform_fee_pct numeric not null default 0,  -- comisión Uber/DiDi (% de la venta de plataforma)
  updated_by uuid references public.users(id) default auth.uid(),
  updated_at timestamptz not null default now()
);
insert into public.cashflow_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.cashflow_items (
  id uuid primary key default gen_random_uuid(),
  concept text not null,
  direction text not null check (direction in ('in', 'out')),
  amount numeric not null check (amount > 0),
  date date not null,                                 -- primera (o única) fecha
  recurrence text not null default 'none' check (recurrence in ('none', 'weekly', 'monthly')),
  until date,                                         -- opcional: hasta cuándo se repite
  notes text,
  active boolean not null default true,
  created_by uuid references public.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.cashflow_settings enable row level security;
alter table public.cashflow_items enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'cashflow_settings' and policyname = 'cashflow_settings_all') then
    create policy cashflow_settings_all on public.cashflow_settings for all to authenticated
      using (public.is_owner_or_monitor()) with check (public.is_owner_or_monitor());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'cashflow_items' and policyname = 'cashflow_items_all') then
    create policy cashflow_items_all on public.cashflow_items for all to authenticated
      using (public.is_owner_or_monitor()) with check (public.is_owner_or_monitor());
  end if;
end $$;

-- Entradas y salidas reales por semana (lunes, hora de Tijuana) y concepto.
create or replace function public.cashflow_weekly(p_from date, p_to date)
 returns table (week date, direction text, concept text, amount numeric)
 language plpgsql stable security definer set search_path to 'public'
as $function$
#variable_conflict use_column
begin
  if not public.is_owner_or_monitor() then
    raise exception 'No autorizado';
  end if;

  return query
  with o as (
    select date_trunc('week', (created_at at time zone 'America/Tijuana'))::date w,
           coalesce(cash_amount, 0) cash, coalesce(card_amount, 0) card,
           case when payment_method = 'platform' then coalesce(total, 0) else 0 end plat,
           coalesce(tip, 0) tip
      from public.orders
     where status = 'delivered'
       and (created_at at time zone 'America/Tijuana')::date between p_from and p_to
  ),
  e as (
    select date_trunc('week', x.date)::date w,
           case when exists (select 1 from public.inventory_purchases p where p.expense_id = x.id)
                then 'Compras de insumos'
                when x.category in ('Costo de venta', 'Insumos') then 'Insumos (gasto directo)'
                else coalesce(nullif(trim(x.category), ''), 'Otros') end c,
           x.amount a
      from public.expenses x
     where x.date between p_from and p_to
  ),
  wp as (
    select date_trunc('week', paid_at::date)::date w, amount a
      from public.wholesale_payments
     where paid_at::date between p_from and p_to
  )
  select w, 'in'::text, 'Efectivo'::text, sum(cash)::numeric from o group by w having sum(cash) <> 0
  union all select w, 'in'::text, 'Tarjeta (terminal)'::text, sum(card)::numeric from o group by w having sum(card) <> 0
  union all select w, 'in'::text, 'Plataformas'::text, sum(plat)::numeric from o group by w having sum(plat) <> 0
  union all select w, 'in'::text, 'Mayoreo'::text, sum(a)::numeric from wp group by w
  union all select w, 'out'::text, 'Propinas al equipo'::text, sum(tip)::numeric from o group by w having sum(tip) <> 0
  union all select w, 'out'::text, c::text, sum(a)::numeric from e group by w, c;
end;
$function$;
grant execute on function public.cashflow_weekly(date, date) to authenticated;
