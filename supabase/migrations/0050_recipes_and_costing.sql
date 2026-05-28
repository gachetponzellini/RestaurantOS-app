-- ═══════════════════════════════════════════════════════════════════════
-- 0050 — Recetas, costeo e ingredientes (stock estimado de cocina)
-- Modelo inspirado en Maxirest (mxins/mxrec/mxinspre) con mejoras:
--   - Presentaciones ilimitadas (vs 3 columnas fijas)
--   - Trigger de descuento de stock por receta al vender
--   - Historial de precios con audit
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. ingredients (insumos)
-- ─────────────────────────────────────────────────────────────────────

create table ingredients (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  unit text not null check (unit in ('kg', 'lt', 'un', 'g', 'ml')),
  waste_percent numeric(5,2) not null default 0
    check (waste_percent >= 0 and waste_percent < 100),
  stock_quantity numeric(12,3) not null default 0,
  stock_min_alert numeric(12,3),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create index ingredients_business_idx on ingredients(business_id);

create trigger ingredients_set_updated_at
  before update on ingredients
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 2. ingredient_presentations (envases / presentaciones)
--    Reemplaza el patrón envase1/2/3 de Maxirest con tabla N:1
-- ─────────────────────────────────────────────────────────────────────

create table ingredient_presentations (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  name text not null,
  net_quantity numeric(12,3) not null check (net_quantity > 0),
  cost_cents integer not null default 0 check (cost_cents >= 0),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index ingredient_presentations_ingredient_idx
  on ingredient_presentations(ingredient_id);

-- Solo una presentación default por ingrediente
create unique index ingredient_presentations_one_default_idx
  on ingredient_presentations(ingredient_id) where is_default = true;

-- ─────────────────────────────────────────────────────────────────────
-- 3. recipes (link producto → ingrediente con cantidad)
-- ─────────────────────────────────────────────────────────────────────

create table recipes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete restrict,
  quantity numeric(12,4) not null check (quantity > 0),
  notes text,
  unique (product_id, ingredient_id)
);

create index recipes_product_idx on recipes(product_id);
create index recipes_ingredient_idx on recipes(ingredient_id);

-- ─────────────────────────────────────────────────────────────────────
-- 4. ingredient_price_log (historial de precios)
-- ─────────────────────────────────────────────────────────────────────

create table ingredient_price_log (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  presentation_id uuid references ingredient_presentations(id) on delete set null,
  old_cost_cents integer not null,
  new_cost_cents integer not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id) on delete set null
);

create index ingredient_price_log_ingredient_idx
  on ingredient_price_log(ingredient_id, recorded_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- 5. RLS — members + platform en todas las tablas
-- ─────────────────────────────────────────────────────────────────────

alter table ingredients enable row level security;
alter table ingredient_presentations enable row level security;
alter table recipes enable row level security;
alter table ingredient_price_log enable row level security;

-- ingredients
create policy "members_select_ingredients" on ingredients
  for select to authenticated using (public.is_business_member(business_id));
create policy "members_insert_ingredients" on ingredients
  for insert to authenticated with check (public.is_business_member(business_id));
create policy "members_update_ingredients" on ingredients
  for update to authenticated using (public.is_business_member(business_id));
create policy "members_delete_ingredients" on ingredients
  for delete to authenticated using (public.is_business_member(business_id));

create policy "platform_select_ingredients" on ingredients
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_ingredients" on ingredients
  for all to authenticated using (public.is_platform_admin());

-- ingredient_presentations (business_id vía join a ingredients)
create policy "members_select_presentations" on ingredient_presentations
  for select to authenticated using (
    exists (select 1 from ingredients i where i.id = ingredient_id and public.is_business_member(i.business_id))
  );
create policy "members_insert_presentations" on ingredient_presentations
  for insert to authenticated with check (
    exists (select 1 from ingredients i where i.id = ingredient_id and public.is_business_member(i.business_id))
  );
create policy "members_update_presentations" on ingredient_presentations
  for update to authenticated using (
    exists (select 1 from ingredients i where i.id = ingredient_id and public.is_business_member(i.business_id))
  );
create policy "members_delete_presentations" on ingredient_presentations
  for delete to authenticated using (
    exists (select 1 from ingredients i where i.id = ingredient_id and public.is_business_member(i.business_id))
  );

create policy "platform_select_presentations" on ingredient_presentations
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_presentations" on ingredient_presentations
  for all to authenticated using (public.is_platform_admin());

-- recipes (business_id vía join a products → categories → business o directo a ingredients)
create policy "members_select_recipes" on recipes
  for select to authenticated using (
    exists (select 1 from ingredients i
      join recipes r_inner on r_inner.ingredient_id = i.id
      where r_inner.id = recipes.id and public.is_business_member(i.business_id))
  );
create policy "members_insert_recipes" on recipes
  for insert to authenticated with check (
    exists (select 1 from ingredients i where i.id = ingredient_id and public.is_business_member(i.business_id))
  );
create policy "members_update_recipes" on recipes
  for update to authenticated using (
    exists (select 1 from ingredients i
      join recipes r_inner on r_inner.ingredient_id = i.id
      where r_inner.id = recipes.id and public.is_business_member(i.business_id))
  );
create policy "members_delete_recipes" on recipes
  for delete to authenticated using (
    exists (select 1 from ingredients i
      join recipes r_inner on r_inner.ingredient_id = i.id
      where r_inner.id = recipes.id and public.is_business_member(i.business_id))
  );

create policy "platform_select_recipes" on recipes
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_recipes" on recipes
  for all to authenticated using (public.is_platform_admin());

-- ingredient_price_log (business_id vía join a ingredients)
create policy "members_select_price_log" on ingredient_price_log
  for select to authenticated using (
    exists (select 1 from ingredients i where i.id = ingredient_id and public.is_business_member(i.business_id))
  );
create policy "members_insert_price_log" on ingredient_price_log
  for insert to authenticated with check (
    exists (select 1 from ingredients i where i.id = ingredient_id and public.is_business_member(i.business_id))
  );

create policy "platform_select_price_log" on ingredient_price_log
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_price_log" on ingredient_price_log
  for all to authenticated using (public.is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 6. Trigger: descuento de stock de ingredientes al vender (via receta)
--    Complementa fn_stock_descuento_on_order_item (que maneja track_stock
--    de bebidas). Este trigger maneja productos CON receta.
-- ─────────────────────────────────────────────────────────────────────

create or replace function fn_recipe_stock_descuento()
returns trigger language plpgsql security definer as $$
declare
  r record;
begin
  -- Skip si el producto ya tiene track_stock (manejado por trg_stock_descuento)
  if exists (select 1 from products where id = new.product_id and track_stock = true) then
    return new;
  end if;

  -- Recorrer cada ingrediente de la receta y descontar
  for r in
    select rec.ingredient_id, rec.quantity
    from recipes rec
    where rec.product_id = new.product_id
  loop
    update ingredients
      set stock_quantity = stock_quantity - (r.quantity * new.quantity),
          updated_at = now()
      where id = r.ingredient_id;
  end loop;

  return new;
end;
$$;

create trigger trg_recipe_stock_descuento
  after insert on order_items
  for each row execute function fn_recipe_stock_descuento();

-- ─────────────────────────────────────────────────────────────────────
-- 7. Trigger: log automático de cambio de precio en presentaciones
-- ─────────────────────────────────────────────────────────────────────

create or replace function fn_ingredient_price_change_log()
returns trigger language plpgsql security definer as $$
begin
  if old.cost_cents is distinct from new.cost_cents then
    insert into ingredient_price_log (ingredient_id, presentation_id, old_cost_cents, new_cost_cents, recorded_by)
    values (new.ingredient_id, new.id, old.cost_cents, new.cost_cents, auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_ingredient_price_change
  after update on ingredient_presentations
  for each row execute function fn_ingredient_price_change_log();
