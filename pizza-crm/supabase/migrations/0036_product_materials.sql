-- 0036: Enlace directo "producto simple -> material" (Fase 5).
-- Para productos SIN receta (refrescos, complementos) que deben descontar
-- inventario al venderse (solos o dentro de un combo/promo). Aditiva.
-- RLS replica el patrón de product_recipes (owner escribe, autenticado lee).

create table if not exists public.product_materials (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text,                       -- null = aplica a cualquier talla
  item_id uuid not null references public.inventory_items(id) on delete restrict,
  qty numeric not null default 1 check (qty > 0),
  unit text not null,              -- unidad de consumo (pza, g, ml, ...)
  created_at timestamptz not null default now()
);

create index if not exists product_materials_product_idx
  on public.product_materials(product_id);

create unique index if not exists product_materials_uniq
  on public.product_materials(product_id, coalesce(size, ''), item_id);

alter table public.product_materials enable row level security;

drop policy if exists product_materials_owner_all on public.product_materials;
create policy product_materials_owner_all on public.product_materials
  for all using (is_owner()) with check (is_owner());

drop policy if exists product_materials_select on public.product_materials;
create policy product_materials_select on public.product_materials
  for select using (auth.uid() is not null);
