-- ============================================
-- Menú del día: componentes como productos reales.
--
-- Extiende daily_menu_components con un discriminador `kind` (text/product/choice)
-- y FK a products. Extiende order_items con parent_order_item_id para items
-- hijos del combo (precio 0, rutean a station, descuentan stock).
-- ============================================

-- A. Extender daily_menu_components ──────────────────────────────────────────

alter table public.daily_menu_components
  add column kind text not null default 'text'
    check (kind in ('text', 'product', 'choice')),
  add column product_id uuid
    references public.products(id) on delete restrict,
  add column choice_group_id uuid,
  add column choice_group_label text;

alter table public.daily_menu_components
  add constraint daily_menu_components_kind_coherent
  check (
    (kind = 'text'    and product_id is null and choice_group_id is null) or
    (kind = 'product' and product_id is not null) or
    (kind = 'choice'  and choice_group_id is not null and product_id is not null)
  );

create index daily_menu_components_product_id
  on public.daily_menu_components (product_id)
  where product_id is not null;

-- B. Extender order_items para items hijos de combo ──────────────────────────

alter table public.order_items
  add column parent_order_item_id uuid
    references public.order_items(id) on delete cascade,
  add column is_combo_component boolean not null default false;

create index order_items_parent
  on public.order_items (parent_order_item_id)
  where parent_order_item_id is not null;
