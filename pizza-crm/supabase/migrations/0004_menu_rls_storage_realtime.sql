-- Menu: RLS, storage bucket for product images, Realtime for live cashier sync.

-- English: stable helper to gate owner-only writes in RLS policies.
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'owner'
  );
$$;

grant execute on function public.is_owner() to authenticated;

grant select, insert, update, delete on table public.products to authenticated;
grant select, insert, update, delete on table public.customization_options to authenticated;

drop policy if exists products_owner_all on public.products;
create policy products_owner_all
  on public.products
  for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists products_staff_select_active on public.products;
create policy products_staff_select_active
  on public.products
  for select
  to authenticated
  using (
    active = true
    and exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('cashier', 'kitchen')
    )
  );

drop policy if exists customization_options_owner_all on public.customization_options;
create policy customization_options_owner_all
  on public.customization_options
  for all
  to authenticated
  using (public.is_owner())
  with check (public.is_owner());

drop policy if exists customization_options_staff_select_active on public.customization_options;
create policy customization_options_staff_select_active
  on public.customization_options
  for select
  to authenticated
  using (
    active = true
    and exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('cashier', 'kitchen')
    )
  );

-- Storage: public bucket for product images (read via public URL).
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read"
  on storage.objects
  for select
  using (bucket_id = 'product-images');

drop policy if exists "product_images_owner_insert" on storage.objects;
create policy "product_images_owner_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'product-images'
    and public.is_owner()
  );

drop policy if exists "product_images_owner_update" on storage.objects;
create policy "product_images_owner_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'product-images' and public.is_owner())
  with check (bucket_id = 'product-images' and public.is_owner());

drop policy if exists "product_images_owner_delete" on storage.objects;
create policy "product_images_owner_delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'product-images' and public.is_owner());

-- Realtime: cashiers/kitchen subscribe without refresh.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    alter publication supabase_realtime add table public.products;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customization_options'
  ) then
    alter publication supabase_realtime add table public.customization_options;
  end if;
end $$;
