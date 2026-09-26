-- 0057_wholesale_payments.sql
-- Anticipos / pagos de mayoreo como ledger. Saldo del cliente = pagos − ventas (sin merma).
-- Un pago puede ir al saldo general (sale_id null) o a una venta específica.
-- wholesale_sales.amount_paid / paid / paid_at pasan a ser DERIVADOS (se recalculan por trigger):
--   1) pagos directos a la venta (hasta su total; el excedente va al saldo general)
--   2) saldo general repartido FIFO a las ventas pendientes más antiguas.
-- Pagos ligados a una venta marcada como merma quedan como saldo a favor.

create table if not exists public.wholesale_payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.wholesale_clients(id),
  sale_id uuid references public.wholesale_sales(id) on delete set null,
  amount numeric not null check (amount > 0),
  paid_at date not null default (now() at time zone 'America/Tijuana')::date,
  method text not null default 'efectivo'
    check (method in ('efectivo','transferencia','tarjeta','otro')),
  notes text,
  created_by uuid default auth.uid() references public.users(id),
  created_at timestamptz not null default now()
);
create index if not exists wholesale_payments_client_idx on public.wholesale_payments(client_id);
create index if not exists wholesale_payments_sale_idx on public.wholesale_payments(sale_id);

alter table public.wholesale_payments enable row level security;
drop policy if exists wholesale_payments_owner on public.wholesale_payments;
create policy wholesale_payments_owner on public.wholesale_payments for all
  to authenticated using (public.is_owner()) with check (public.is_owner());

-- Recalcula lo pagado de cada venta del cliente.
create or replace function public.recalc_wholesale_client(p_client_id uuid)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare
  s record;
  v_pool numeric;
  v_direct numeric;
  v_applied numeric;
  v_take numeric;
begin
  if p_client_id is null then return; end if;

  -- Saldo general = pagos sin venta + pagos a ventas en merma o inexistentes
  select coalesce(sum(p.amount), 0) into v_pool
  from public.wholesale_payments p
  left join public.wholesale_sales ws on ws.id = p.sale_id
  where p.client_id = p_client_id
    and (p.sale_id is null or ws.id is null or ws.merma or ws.client_id <> p_client_id);

  -- Pase 1: pagos directos (excedente al saldo general)
  for s in
    select ws.id, ws.total from public.wholesale_sales ws
    where ws.client_id = p_client_id and not ws.merma
  loop
    select coalesce(sum(amount), 0) into v_direct
      from public.wholesale_payments where sale_id = s.id and client_id = p_client_id;
    if v_direct > s.total then
      v_pool := v_pool + (v_direct - s.total);
    end if;
  end loop;

  -- Pase 2: FIFO del saldo general
  for s in
    select ws.id, ws.total, ws.paid, ws.paid_at from public.wholesale_sales ws
    where ws.client_id = p_client_id
    order by ws.sold_at, ws.created_at
  loop
    if exists (select 1 from public.wholesale_sales where id = s.id and merma) then
      update public.wholesale_sales set amount_paid = 0, paid = false, paid_at = null
        where id = s.id and (amount_paid <> 0 or paid);
      continue;
    end if;
    select least(coalesce(sum(amount), 0), s.total) into v_applied
      from public.wholesale_payments where sale_id = s.id and client_id = p_client_id;
    v_take := least(greatest(s.total - v_applied, 0), v_pool);
    v_applied := v_applied + v_take;
    v_pool := v_pool - v_take;
    update public.wholesale_sales set
      amount_paid = round(v_applied, 2),
      paid = (s.total > 0 and v_applied >= s.total - 0.001) or s.total = 0,
      paid_at = case
        when (s.total > 0 and v_applied >= s.total - 0.001) or s.total = 0
          then coalesce(s.paid_at, now())
        else null end
    where id = s.id;
  end loop;
end;
$function$;
revoke all on function public.recalc_wholesale_client(uuid) from public, anon;
grant execute on function public.recalc_wholesale_client(uuid) to authenticated;

-- Triggers
create or replace function public.trg_wholesale_payments_recalc()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if tg_op in ('UPDATE','DELETE') then perform public.recalc_wholesale_client(old.client_id); end if;
  if tg_op in ('INSERT','UPDATE') and (tg_op = 'INSERT' or new.client_id is distinct from old.client_id) then
    perform public.recalc_wholesale_client(new.client_id);
  end if;
  return null;
end;
$function$;
drop trigger if exists wholesale_payments_recalc on public.wholesale_payments;
create trigger wholesale_payments_recalc after insert or update or delete on public.wholesale_payments
  for each row execute function public.trg_wholesale_payments_recalc();

create or replace function public.trg_wholesale_sales_recalc()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op in ('UPDATE','DELETE') then perform public.recalc_wholesale_client(old.client_id); end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.client_id is distinct from old.client_id) then
    perform public.recalc_wholesale_client(new.client_id);
  end if;
  return null;
end;
$function$;
drop trigger if exists wholesale_sales_recalc on public.wholesale_sales;
create trigger wholesale_sales_recalc
  after insert or delete or update of total, merma, client_id, sold_at on public.wholesale_sales
  for each row execute function public.trg_wholesale_sales_recalc();

-- Saldo por cliente (positivo = a favor, negativo = adeudo)
create or replace view public.v_wholesale_client_balance with (security_invoker = true) as
select c.id as client_id, c.name,
  coalesce((select sum(total) from public.wholesale_sales s where s.client_id = c.id and not s.merma), 0) as total_ventas,
  coalesce((select sum(amount) from public.wholesale_payments p where p.client_id = c.id), 0) as total_pagos,
  coalesce((select sum(amount) from public.wholesale_payments p where p.client_id = c.id), 0)
  - coalesce((select sum(total) from public.wholesale_sales s where s.client_id = c.id and not s.merma), 0) as saldo
from public.wholesale_clients c;

-- Migración de cobros existentes → pagos ligados a su venta
insert into public.wholesale_payments (client_id, sale_id, amount, paid_at, method, notes, created_by)
select s.client_id, s.id, s.amount_paid,
  coalesce((s.paid_at at time zone 'America/Tijuana')::date, s.sold_at), 'otro', 'Migrado (cobro previo)', s.created_by
from public.wholesale_sales s
where s.amount_paid > 0
  and not exists (select 1 from public.wholesale_payments p where p.sale_id = s.id);
