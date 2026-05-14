-- Add cancelled status + cancellation metadata on orders.
alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'preparing', 'ready', 'delivered', 'cancelled'));

alter table public.orders
  add column if not exists cancelled_reason text null;

alter table public.orders
  add column if not exists cancelled_at timestamptz null;

comment on column public.orders.cancelled_reason is 'Optional reason captured when an order is cancelled.';
comment on column public.orders.cancelled_at is 'Timestamp when cashier cancelled the order.';

-- Explicitly allow cashier updates while enforcing valid status values.
drop policy if exists orders_cashier_update on public.orders;
create policy orders_cashier_update
  on public.orders
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'cashier'
    )
  )
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'cashier'
    )
    and status in ('pending', 'preparing', 'ready', 'delivered', 'cancelled')
  );
