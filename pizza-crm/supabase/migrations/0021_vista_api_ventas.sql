-- 0021: Vista de ventas para consumo vía API externa
-- Solo expone datos agregados de órdenes entregadas.
-- NO incluye datos sensibles (teléfono del cliente, notas de cancelación, etc.)

create or replace view public.v_api_ventas as
select
  o.id                                as orden_id,
  o.created_at,
  o.created_at::date                  as fecha,
  extract(hour from o.created_at)     as hora,
  o.origin                            as origen,
  o.payment_method                    as metodo_pago,
  o.total                             as total_orden,
  o.tip                               as propina,
  o.discount                          as descuento,
  t.name                              as mesa,
  p.name                              as producto,
  p.category                          as categoria,
  oi.size                             as tamano,
  oi.quantity                         as cantidad,
  oi.unit_price                       as precio_unitario,
  (oi.quantity * oi.unit_price)       as subtotal
from public.orders o
join public.order_items oi on oi.order_id = o.id
join public.products p    on p.id = oi.product_id
left join public.tables t on t.id = o.table_id
where o.status = 'delivered'
  and oi.is_combo_component = false;

-- Nota: la ruta /api/v1/ventas consulta esta vista con la service_role key,
-- que ignora RLS. La vista ES el límite de seguridad: lo que no esté aquí,
-- no se puede consultar desde la API. Si algún día agregas columnas
-- sensibles a orders o products, NO las agregues aquí.
