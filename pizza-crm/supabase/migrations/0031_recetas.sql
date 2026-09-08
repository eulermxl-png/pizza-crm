-- 0031: Recetas (BOM), componentes, enlace menú→receta, y peso por pieza. Aditiva.
-- Aplicada en Supabase (kbkdymufoqhgcarkjjar) el 2026-09-08.

alter table public.inventory_items
  add column if not exists piece_size numeric;  -- cantidad en unidad base por 1 pieza (ej. limón = 100 g)

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  section text not null default 'pizza',   -- pizza | base_pizza | salsa | bebida | complemento | otro
  yield_qty numeric not null default 1,
  yield_unit text references public.units(code),
  yield_pct numeric not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.recipe_components (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  component_type text not null check (component_type in ('ingredient','recipe')),
  ingredient_id uuid references public.inventory_items(id),
  sub_recipe_id uuid references public.recipes(id),
  component_role text not null default 'topping' check (component_role in ('base','topping')),
  qty numeric not null check (qty > 0),
  unit text not null references public.units(code),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint recipe_component_target check (
    (component_type = 'ingredient' and ingredient_id is not null and sub_recipe_id is null) or
    (component_type = 'recipe' and sub_recipe_id is not null and ingredient_id is null)
  ),
  constraint recipe_component_no_self check (sub_recipe_id is null or sub_recipe_id <> recipe_id)
);
create index if not exists recipe_components_recipe_idx on public.recipe_components(recipe_id, sort_order);

create table if not exists public.product_recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  size text,
  recipe_id uuid not null references public.recipes(id),
  created_at timestamptz not null default now(),
  unique (product_id, size)
);

alter table public.recipes enable row level security;
alter table public.recipe_components enable row level security;
alter table public.product_recipes enable row level security;

create policy recipes_owner_all on public.recipes for all using (is_owner()) with check (is_owner());
create policy recipes_select on public.recipes for select using (auth.uid() is not null);
create policy recipe_components_owner_all on public.recipe_components for all using (is_owner()) with check (is_owner());
create policy recipe_components_select on public.recipe_components for select using (auth.uid() is not null);
create policy product_recipes_owner_all on public.product_recipes for all using (is_owner()) with check (is_owner());
create policy product_recipes_select on public.product_recipes for select using (auth.uid() is not null);

grant select, insert, update, delete on public.recipes to authenticated;
grant select, insert, update, delete on public.recipe_components to authenticated;
grant select, insert, update, delete on public.product_recipes to authenticated;
