-- Enlace extra (customization) -> material de inventario, para descontar al vender.
create table if not exists public.customization_materials (
  id uuid primary key default gen_random_uuid(),
  customization_id uuid not null references public.customization_options(id) on delete cascade,
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  qty numeric not null check (qty > 0),
  unit text not null,
  created_at timestamptz not null default now()
);

create index if not exists customization_materials_customization_idx
  on public.customization_materials(customization_id);

alter table public.customization_materials enable row level security;

drop policy if exists customization_materials_read on public.customization_materials;
create policy customization_materials_read
  on public.customization_materials for select
  to authenticated using (true);

drop policy if exists customization_materials_write on public.customization_materials;
create policy customization_materials_write
  on public.customization_materials for all
  to authenticated using (public.is_owner()) with check (public.is_owner());
