-- 0060: correr JUSTO DESPUÉS de desplegar el frontend de plataformas.
-- Pedidos DIDI/Uber anteriores (o capturados con el POS viejo) → pago 'platform',
-- plataforma sin especificar. No entran a caja ni terminal.
update public.orders
   set payment_method = 'platform', cash_amount = 0, card_amount = 0, tip = 0
 where origin = 'delivery_app'
   and coalesce(payment_method, '') <> 'platform';
