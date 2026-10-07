-- 0059: Pedidos de plataforma (Uber / DiDi)
-- - Precio y alta por plataforma en el catálogo (product_platform_prices)
-- - orders.platform ('uber' | 'didi' | null = sin especificar) para origin = 'delivery_app'
-- - payment_method = 'platform': no entra a caja ni a terminal (cash/card = 0)
-- - Cancelado después de preparar (cancel_waste): descuenta insumos como merma
-- - Vistas de reportes: etiqueta Uber / DiDi / Plataforma y columna plataforma
-- Idempotente.

-- 1) Precios por plataforma -------------------------------------------------
create table if not exists public.product_platform_prices (
  product_id uuid not null references public.products(id) on delete cascade,
  platform   text not null check (platform in ('uber', 'didi')),
  price      numeric(10,2) not null check (price >= 0),
  active     boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (product_id, platform)
);

alter table public.product_platform_prices enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'product_platform_prices' and policyname = 'product_platform_prices_select') then
    create policy product_platform_prices_select on public.product_platform_prices
      for select to authenticated using (auth.uid() is not null);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'product_platform_prices' and policyname = 'product_platform_prices_owner_all') then
    create policy product_platform_prices_owner_all on public.product_platform_prices
      for all to authenticated using (public.is_owner()) with check (public.is_owner());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'product_platform_prices'
  ) then
    alter publication supabase_realtime add table public.product_platform_prices;
  end if;
end $$;

-- 2) Columnas en orders ------------------------------------------------------
alter table public.orders add column if not exists platform text;
alter table public.orders add column if not exists cancel_waste boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orders_platform_check') then
    alter table public.orders add constraint orders_platform_check
      check (platform is null or (platform in ('uber', 'didi') and origin = 'delivery_app'));
  end if;
end $$;

-- 3) Trigger: entregado = consumo; cancelado ya preparado = merma -----------
create or replace function public.orders_consume_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.status = 'delivered'
     and (OLD.status is distinct from 'delivered')
     and coalesce(NEW.inventory_applied, false) = false then
    begin
      perform public.consume_order(NEW.id);
      NEW.inventory_applied := true;
    exception when others then
      NEW.inventory_applied := false;  -- no romper la venta; se puede reprocesar
    end;
  elsif NEW.status = 'cancelled'
     and (OLD.status is distinct from 'cancelled')
     and coalesce(NEW.cancel_waste, false) = true
     and coalesce(NEW.inventory_applied, false) = false then
    begin
      perform public.consume_order(NEW.id);
      update public.inventory_movements
         set type = 'waste',
             note = 'Merma: pedido cancelado',
             reason = coalesce(NEW.cancelled_reason, 'Pedido cancelado ya preparado')
       where ref_type = 'order' and ref_id = NEW.id and type = 'consumption';
      NEW.inventory_applied := true;
    exception when others then
      NEW.inventory_applied := false;
    end;
  end if;
  return NEW;
end $function$;

-- 4) Historial: ver 0060_platform_backfill.sql (se corre al desplegar el frontend)

-- 5) Vistas de reportes (columnas nuevas al final) ---------------------------
create or replace view public.v_ordenes as
 SELECT o.id AS orden_id,
    (o.created_at AT TIME ZONE 'America/Tijuana') AS fecha_hora,
    ((o.created_at AT TIME ZONE 'America/Tijuana'))::date AS fecha,
    (EXTRACT(hour FROM (o.created_at AT TIME ZONE 'America/Tijuana')))::integer AS hora,
    CASE EXTRACT(dow FROM (o.created_at AT TIME ZONE 'America/Tijuana'))
      WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Lunes' WHEN 2 THEN 'Martes'
      WHEN 3 THEN 'Miércoles' WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes'
      WHEN 6 THEN 'Sábado' ELSE NULL END AS dia_semana,
    CASE o.origin
      WHEN 'walk_in' THEN 'Mostrador'
      WHEN 'phone' THEN 'Teléfono'
      WHEN 'delivery_app' THEN CASE o.platform WHEN 'uber' THEN 'Uber' WHEN 'didi' THEN 'DiDi' ELSE 'DIDI/Uber' END
      WHEN 'goat' THEN 'Goat'
      WHEN 'padel' THEN 'Padel'
      ELSE o.origin END AS origen,
    CASE o.payment_method
      WHEN 'cash' THEN 'Efectivo'
      WHEN 'card' THEN 'Tarjeta'
      WHEN 'mixed' THEN 'Mixto'
      WHEN 'platform' THEN 'Plataforma'
      ELSE COALESCE(o.payment_method, 'Sin registrar') END AS metodo_pago,
    o.total,
    COALESCE(o.cash_amount, 0::numeric) AS efectivo,
    COALESCE(o.card_amount, 0::numeric) AS tarjeta,
    COALESCE(o.tip, 0::numeric) AS propina,
    COALESCE(o.discount, 0::numeric) AS descuento,
    t.name AS mesa,
    o.customer_name AS cliente,
    CASE WHEN o.origin = 'delivery_app' THEN COALESCE(o.platform, 'sin especificar') END AS plataforma
   FROM orders o
   LEFT JOIN tables t ON t.id = o.table_id
  WHERE o.status = 'delivered';

create or replace view public.v_ventas as
 SELECT oi.id AS item_id,
    o.id AS orden_id,
    (o.created_at AT TIME ZONE 'America/Tijuana') AS fecha_hora,
    ((o.created_at AT TIME ZONE 'America/Tijuana'))::date AS fecha,
    (EXTRACT(hour FROM (o.created_at AT TIME ZONE 'America/Tijuana')))::integer AS hora,
    CASE EXTRACT(dow FROM (o.created_at AT TIME ZONE 'America/Tijuana'))
      WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Lunes' WHEN 2 THEN 'Martes'
      WHEN 3 THEN 'Miércoles' WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes'
      WHEN 6 THEN 'Sábado' ELSE NULL END AS dia_semana,
    CASE o.origin
      WHEN 'walk_in' THEN 'Mostrador'
      WHEN 'phone' THEN 'Teléfono'
      WHEN 'delivery_app' THEN CASE o.platform WHEN 'uber' THEN 'Uber' WHEN 'didi' THEN 'DiDi' ELSE 'DIDI/Uber' END
      WHEN 'goat' THEN 'Goat'
      WHEN 'padel' THEN 'Padel'
      ELSE o.origin END AS origen,
    p.name AS producto,
    p.category AS categoria,
    oi.size AS tamano,
    oi.quantity AS cantidad,
    oi.unit_price AS precio_unitario,
    (oi.quantity::numeric * oi.unit_price) AS subtotal,
    CASE WHEN o.origin = 'delivery_app' THEN COALESCE(o.platform, 'sin especificar') END AS plataforma
   FROM orders o
   JOIN order_items oi ON oi.order_id = o.id
   JOIN products p ON p.id = oi.product_id
  WHERE o.status = 'delivered' AND oi.is_combo_component = false;

create or replace view public.v_resumen_diario as
 WITH ventas AS (
   SELECT ((orders.created_at AT TIME ZONE 'America/Tijuana'))::date AS fecha,
          count(*) AS ordenes,
          sum(orders.total) AS ventas,
          sum(COALESCE(orders.tip, 0::numeric)) AS propinas,
          sum(CASE WHEN orders.payment_method = 'platform' THEN orders.total ELSE 0 END) AS ventas_plataforma
     FROM orders
    WHERE orders.status = 'delivered'
    GROUP BY 1
 ), gastos AS (
   SELECT expenses.date AS fecha, sum(expenses.amount) AS gastos
     FROM expenses GROUP BY expenses.date
 )
 SELECT COALESCE(v.fecha, g.fecha) AS fecha,
    CASE EXTRACT(dow FROM COALESCE(v.fecha, g.fecha))
      WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Lunes' WHEN 2 THEN 'Martes'
      WHEN 3 THEN 'Miércoles' WHEN 4 THEN 'Jueves' WHEN 5 THEN 'Viernes'
      WHEN 6 THEN 'Sábado' ELSE NULL END AS dia_semana,
    COALESCE(v.ordenes, 0::bigint) AS ordenes,
    COALESCE(v.ventas, 0::numeric) AS ventas,
    COALESCE(v.propinas, 0::numeric) AS propinas,
    COALESCE(g.gastos, 0::numeric) AS gastos,
    (COALESCE(v.ventas, 0::numeric) - COALESCE(g.gastos, 0::numeric)) AS utilidad,
    COALESCE(v.ventas_plataforma, 0::numeric) AS ventas_plataforma
   FROM ventas v
   FULL JOIN gastos g ON g.fecha = v.fecha;
