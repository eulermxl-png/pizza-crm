-- Cashier: delete unpaid orders linked to a mesa (cancelar comanda / mesa).
-- order_items cascade from orders on delete.

drop policy if exists orders_cashier_delete_unpaid_table on public.orders;

create policy orders_cashier_delete_unpaid_table
  on public.orders
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'cashier'
    )
    and payment_method is null
    and table_id is not null
  );
