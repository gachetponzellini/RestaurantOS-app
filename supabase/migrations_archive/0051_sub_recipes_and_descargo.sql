-- =============================================================
-- 0051 — Sub-recetas, descargo audit log, reversión en cancelación
--
-- 1. ingredient_recipes: receta de ingredientes compuestos
-- 2. is_composite flag en ingredients
-- 3. ingredient_consumptions: log de cada consumo/reversión
-- 4. Reescribe fn_recipe_stock_descuento() para loguear + explotar sub-recetas
-- 5. Nuevo trigger fn_recipe_stock_reversion() en cancelación de orders
-- =============================================================

-- ─────────────────────────────────────────────────────────────────────
-- 1. Flag compuesto en ingredients
-- ─────────────────────────────────────────────────────────────────────

alter table ingredients
  add column is_composite boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────
-- 2. ingredient_recipes (sub-receta de ingrediente compuesto)
-- ─────────────────────────────────────────────────────────────────────

create table ingredient_recipes (
  id uuid primary key default gen_random_uuid(),
  parent_ingredient_id uuid not null references ingredients(id) on delete cascade,
  child_ingredient_id  uuid not null references ingredients(id) on delete restrict,
  quantity numeric(12,4) not null check (quantity > 0),
  notes text,
  unique (parent_ingredient_id, child_ingredient_id)
);

create index ingredient_recipes_parent_idx
  on ingredient_recipes(parent_ingredient_id);
create index ingredient_recipes_child_idx
  on ingredient_recipes(child_ingredient_id);

-- Evitar auto-referencia directa
alter table ingredient_recipes
  add constraint ingredient_recipes_no_self_ref
  check (parent_ingredient_id != child_ingredient_id);

-- ─────────────────────────────────────────────────────────────────────
-- 3. ingredient_consumptions (descargo audit log)
-- ─────────────────────────────────────────────────────────────────────

create table ingredient_consumptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  order_item_id uuid references order_items(id) on delete set null,
  quantity numeric(12,4) not null,
  cost_cents_snapshot integer not null default 0,
  kind text not null default 'venta'
    check (kind in ('venta', 'reversion', 'ajuste', 'merma', 'compra')),
  created_at timestamptz not null default now()
);

create index ingredient_consumptions_business_idx
  on ingredient_consumptions(business_id, created_at desc);
create index ingredient_consumptions_ingredient_idx
  on ingredient_consumptions(ingredient_id, created_at desc);
create index ingredient_consumptions_order_item_idx
  on ingredient_consumptions(order_item_id)
  where order_item_id is not null;

-- ─────────────────────────────────────────────────────────────────────
-- 4. RLS — ingredient_recipes
-- ─────────────────────────────────────────────────────────────────────

alter table ingredient_recipes enable row level security;

create policy "members_select_ingredient_recipes" on ingredient_recipes
  for select to authenticated using (
    exists (select 1 from ingredients i
      where i.id = parent_ingredient_id
      and public.is_business_member(i.business_id))
  );
create policy "members_insert_ingredient_recipes" on ingredient_recipes
  for insert to authenticated with check (
    exists (select 1 from ingredients i
      where i.id = parent_ingredient_id
      and public.is_business_member(i.business_id))
  );
create policy "members_update_ingredient_recipes" on ingredient_recipes
  for update to authenticated using (
    exists (select 1 from ingredients i
      where i.id = parent_ingredient_id
      and public.is_business_member(i.business_id))
  );
create policy "members_delete_ingredient_recipes" on ingredient_recipes
  for delete to authenticated using (
    exists (select 1 from ingredients i
      where i.id = parent_ingredient_id
      and public.is_business_member(i.business_id))
  );

create policy "platform_select_ingredient_recipes" on ingredient_recipes
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_ingredient_recipes" on ingredient_recipes
  for all to authenticated using (public.is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 5. RLS — ingredient_consumptions
-- ─────────────────────────────────────────────────────────────────────

alter table ingredient_consumptions enable row level security;

create policy "members_select_consumptions" on ingredient_consumptions
  for select to authenticated using (public.is_business_member(business_id));
create policy "members_insert_consumptions" on ingredient_consumptions
  for insert to authenticated with check (public.is_business_member(business_id));

create policy "platform_select_consumptions" on ingredient_consumptions
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_consumptions" on ingredient_consumptions
  for all to authenticated using (public.is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 6. Helper: resolver costo unitario de un ingrediente (simple o compuesto)
--    Retorna cost_cents por unidad base. Para compuestos, resuelve recursivamente.
-- ─────────────────────────────────────────────────────────────────────

create or replace function fn_ingredient_cost_per_unit(p_ingredient_id uuid)
returns numeric language plpgsql stable as $$
declare
  v_composite boolean;
  v_cost numeric;
  v_waste numeric;
  r record;
begin
  select is_composite, waste_percent
    into v_composite, v_waste
    from ingredients where id = p_ingredient_id;

  if not v_composite then
    -- Ingrediente simple: costo de presentación default
    select case when ip.net_quantity > 0
                then ip.cost_cents::numeric / ip.net_quantity
                else 0 end
      into v_cost
      from ingredient_presentations ip
      where ip.ingredient_id = p_ingredient_id
        and ip.is_default = true
      limit 1;
    return coalesce(v_cost, 0);
  end if;

  -- Ingrediente compuesto: sumar costos de hijos × cantidad × (1 + waste/100)
  v_cost := 0;
  for r in
    select ir.child_ingredient_id, ir.quantity,
           i.waste_percent as child_waste
    from ingredient_recipes ir
    join ingredients i on i.id = ir.child_ingredient_id
    where ir.parent_ingredient_id = p_ingredient_id
  loop
    v_cost := v_cost + (
      fn_ingredient_cost_per_unit(r.child_ingredient_id)
      * r.quantity
      * (1 + r.child_waste / 100)
    );
  end loop;

  return v_cost;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 7. Helper: explotar un ingrediente en sus hojas (ingredientes simples)
--    Para sub-recetas, recursivamente retorna las hojas con cantidades acumuladas.
-- ─────────────────────────────────────────────────────────────────────

create or replace function fn_explode_ingredient(
  p_ingredient_id uuid,
  p_quantity numeric
)
returns table(leaf_ingredient_id uuid, leaf_quantity numeric, leaf_cost_per_unit numeric)
language plpgsql stable as $$
declare
  v_composite boolean;
  v_cost numeric;
  r record;
begin
  select is_composite into v_composite
    from ingredients where id = p_ingredient_id;

  if not v_composite then
    -- Hoja: retornar directamente
    leaf_ingredient_id := p_ingredient_id;
    leaf_quantity := p_quantity;
    leaf_cost_per_unit := fn_ingredient_cost_per_unit(p_ingredient_id);
    return next;
    return;
  end if;

  -- Compuesto: explotar hijos
  for r in
    select ir.child_ingredient_id, ir.quantity
    from ingredient_recipes ir
    where ir.parent_ingredient_id = p_ingredient_id
  loop
    return query
      select * from fn_explode_ingredient(r.child_ingredient_id, p_quantity * r.quantity);
  end loop;

  return;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 8. Reescribir fn_recipe_stock_descuento()
--    Ahora: explota sub-recetas + loguea en ingredient_consumptions
-- ─────────────────────────────────────────────────────────────────────

create or replace function fn_recipe_stock_descuento()
returns trigger language plpgsql security definer as $$
declare
  r record;
  leaf record;
  v_business_id uuid;
begin
  -- Skip si el producto ya tiene track_stock (manejado por trg_stock_descuento)
  if exists (select 1 from products where id = new.product_id and track_stock = true) then
    return new;
  end if;

  -- Obtener business_id del pedido
  select o.business_id into v_business_id
    from orders o
    join order_items oi on oi.order_id = o.id
    where oi.id = new.id
    limit 1;

  -- Recorrer cada ingrediente de la receta
  for r in
    select rec.ingredient_id, rec.quantity
    from recipes rec
    where rec.product_id = new.product_id
  loop
    -- Explotar sub-recetas: obtener ingredientes hoja
    for leaf in
      select * from fn_explode_ingredient(r.ingredient_id, r.quantity * new.quantity)
    loop
      -- Descontar stock del ingrediente hoja
      update ingredients
        set stock_quantity = stock_quantity - leaf.leaf_quantity,
            updated_at = now()
        where id = leaf.leaf_ingredient_id;

      -- Loguear consumo
      insert into ingredient_consumptions
        (business_id, ingredient_id, order_item_id, quantity, cost_cents_snapshot, kind)
      values (
        v_business_id,
        leaf.leaf_ingredient_id,
        new.id,
        leaf.leaf_quantity,
        round(leaf.leaf_cost_per_unit * leaf.leaf_quantity)::integer,
        'venta'
      );
    end loop;
  end loop;

  return new;
end;
$$;

-- El trigger trg_recipe_stock_descuento ya existe en 0050, no hay que recrearlo.
-- La función se reemplaza in-place con CREATE OR REPLACE.

-- ─────────────────────────────────────────────────────────────────────
-- 9. Nuevo trigger: reversión de stock al cancelar pedido
-- ─────────────────────────────────────────────────────────────────────

create or replace function fn_recipe_stock_reversion()
returns trigger language plpgsql security definer as $$
declare
  item record;
  r record;
  leaf record;
begin
  -- Solo actuar si el status cambió a 'cancelled'
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    -- Para cada item del pedido
    for item in
      select oi.id as item_id, oi.product_id, oi.quantity
      from order_items oi
      where oi.order_id = new.id
    loop
      -- Skip productos con track_stock (tienen su propio sistema)
      if exists (select 1 from products where id = item.product_id and track_stock = true) then
        continue;
      end if;

      -- Para cada ingrediente de la receta
      for r in
        select rec.ingredient_id, rec.quantity
        from recipes rec
        where rec.product_id = item.product_id
      loop
        -- Explotar sub-recetas
        for leaf in
          select * from fn_explode_ingredient(r.ingredient_id, r.quantity * item.quantity)
        loop
          -- Revertir stock
          update ingredients
            set stock_quantity = stock_quantity + leaf.leaf_quantity,
                updated_at = now()
            where id = leaf.leaf_ingredient_id;

          -- Loguear reversión
          insert into ingredient_consumptions
            (business_id, ingredient_id, order_item_id, quantity, cost_cents_snapshot, kind)
          values (
            new.business_id,
            leaf.leaf_ingredient_id,
            item.item_id,
            leaf.leaf_quantity,
            0,
            'reversion'
          );
        end loop;
      end loop;
    end loop;
  end if;

  return new;
end;
$$;

create trigger trg_recipe_stock_reversion
  after update on orders
  for each row execute function fn_recipe_stock_reversion();
