-- ============================================
-- Soften product / daily_menu / modifier FKs in order_items + order_item_modifiers
-- ============================================
-- Hoy borrar un producto falla si está referenciado en algún `order_items` (FK
-- sin ON DELETE = RESTRICT). Esto rompe el flujo de admin cada vez que el
-- dueño quiere limpiar un producto viejo que tuvo pedidos.
--
-- Las tablas `order_items` y `order_item_modifiers` ya guardan **snapshots**
-- (`product_name`, `unit_price_cents`, `subtotal_cents`, `modifier_name`,
-- `price_delta_cents`) — la FK al producto/menu/modifier es solo informativa
-- para reportes. El historial sigue siendo legible aunque el FK quede NULL.
--
-- Solución: cambiamos a ON DELETE SET NULL. La fila histórica queda con
-- product_id = NULL pero el snapshot está intacto. El check constraint que
-- forzaba (product_id OR daily_menu_id) se elimina porque después de un
-- delete podríamos terminar con ambos en NULL — y eso está bien para filas
-- históricas (los snapshots cubren el render).
-- ============================================

-- Drop the check constraint first (it'd block ON DELETE SET NULL)
alter table public.order_items
  drop constraint if exists order_items_product_or_menu_check;

-- Some Postgres versions auto-name the check; if it's not the explicit name
-- above, find it dynamically.
do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.order_items'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%product_id%daily_menu_id%'
  loop
    execute format('alter table public.order_items drop constraint %I', c.conname);
  end loop;
end$$;

-- ── order_items.product_id → products(id) ON DELETE SET NULL ─────────────
alter table public.order_items
  drop constraint if exists order_items_product_id_fkey;

alter table public.order_items
  add constraint order_items_product_id_fkey
  foreign key (product_id) references public.products(id) on delete set null;

-- ── order_items.daily_menu_id → daily_menus(id) ON DELETE SET NULL ───────
alter table public.order_items
  drop constraint if exists order_items_daily_menu_id_fkey;

alter table public.order_items
  add constraint order_items_daily_menu_id_fkey
  foreign key (daily_menu_id) references public.daily_menus(id) on delete set null;

-- ── order_item_modifiers.modifier_id → modifiers(id) ON DELETE SET NULL ──
alter table public.order_item_modifiers
  drop constraint if exists order_item_modifiers_modifier_id_fkey;

alter table public.order_item_modifiers
  add constraint order_item_modifiers_modifier_id_fkey
  foreign key (modifier_id) references public.modifiers(id) on delete set null;
