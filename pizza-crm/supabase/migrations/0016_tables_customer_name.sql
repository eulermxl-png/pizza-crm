-- Optional guest label for a table session (set when opening a mesa from cashier).
alter table public.tables
  add column if not exists customer_name text null;

comment on column public.tables.customer_name is 'Optional label for the table session (e.g. family name); cleared when mesa is freed.';

-- Kitchen reads orders with embedded `tables`; allow select on tables for kitchen role.
drop policy if exists tables_kitchen_select on public.tables;
create policy tables_kitchen_select
  on public.tables
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role = 'kitchen'
    )
  );
