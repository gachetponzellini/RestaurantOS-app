-- 0063 · Endurecimiento de DB (quick wins de advisors Supabase)
--
-- Dos bloques, ambos sin cambio de comportamiento:
--   A) Índices de cobertura para foreign keys sin indexar (advisor: unindexed_foreign_keys).
--      Aditivo puro — solo mejora el planner en JOINs y ON DELETE/UPDATE.
--   B) Pin de search_path en funciones que lo tenían mutable (advisor: function_search_path_mutable).
--      Crítico en las SECURITY DEFINER: search_path mutable = vector de escalación de privilegios.
--      Se fija a `pg_catalog, public` (built-ins primero; resuelve objetos public sin cambiar nada).
--
-- Pendiente (NO acá, requiere análisis de uso en RLS): REVOKE EXECUTE de funciones
-- SECURITY DEFINER expuestas a anon/authenticated, y consolidación de policies permisivas.

-- ─────────────────────────────────────────────────────────────────────────
-- A) Índices de cobertura para FKs
-- ─────────────────────────────────────────────────────────────────────────
create index if not exists idx_business_groups_owner_user_id        on public.business_groups (owner_user_id);
create index if not exists idx_caja_cortes_encargado_id             on public.caja_cortes (encargado_id);
create index if not exists idx_caja_movimientos_created_by          on public.caja_movimientos (created_by);
create index if not exists idx_caja_user_assignments_caja_id        on public.caja_user_assignments (caja_id);
create index if not exists idx_caja_user_assignments_user_id        on public.caja_user_assignments (user_id);
create index if not exists idx_campaign_messages_customer_id        on public.campaign_messages (customer_id);
create index if not exists idx_campaign_messages_redeemed_order_id  on public.campaign_messages (redeemed_order_id);
create index if not exists idx_chatbot_conversations_business_id    on public.chatbot_conversations (business_id);
create index if not exists idx_clock_allowed_origins_created_by     on public.clock_allowed_origins (created_by);
create index if not exists idx_ingredient_price_log_presentation_id on public.ingredient_price_log (presentation_id);
create index if not exists idx_ingredient_price_log_recorded_by     on public.ingredient_price_log (recorded_by);
create index if not exists idx_modifier_groups_business_id          on public.modifier_groups (business_id);
create index if not exists idx_mozo_rendiciones_mozo_id             on public.mozo_rendiciones (mozo_id);
create index if not exists idx_mozo_rendiciones_registered_by       on public.mozo_rendiciones (registered_by);
create index if not exists idx_notification_preferences_target_user_id on public.notification_preferences (target_user_id);
create index if not exists idx_order_item_modifiers_modifier_id     on public.order_item_modifiers (modifier_id);
create index if not exists idx_order_items_daily_menu_id            on public.order_items (daily_menu_id);
create index if not exists idx_order_items_loaded_by                on public.order_items (loaded_by);
create index if not exists idx_order_items_product_id               on public.order_items (product_id);
create index if not exists idx_order_status_history_changed_by      on public.order_status_history (changed_by);
create index if not exists idx_payments_operated_by                 on public.payments (operated_by);
create index if not exists idx_products_category_id                 on public.products (category_id);
create index if not exists idx_stock_items_product_id               on public.stock_items (product_id);
create index if not exists idx_stock_movimientos_created_by         on public.stock_movimientos (created_by);
create index if not exists idx_stock_movimientos_order_item_id      on public.stock_movimientos (order_item_id);
create index if not exists idx_supplier_ingredients_business_id     on public.supplier_ingredients (business_id);
create index if not exists idx_supplier_ingredients_ingredient_id   on public.supplier_ingredients (ingredient_id);
create index if not exists idx_supplier_invoices_created_by         on public.supplier_invoices (created_by);
create index if not exists idx_tables_current_order_id              on public.tables (current_order_id);
create index if not exists idx_tables_audit_log_by_user_id          on public.tables_audit_log (by_user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- B) Pin de search_path
-- ─────────────────────────────────────────────────────────────────────────
alter function public.set_order_number()                                set search_path = pg_catalog, public;
alter function public.set_updated_at()                                  set search_path = pg_catalog, public;
alter function public.log_order_status_change()                         set search_path = pg_catalog, public;
alter function public.log_order_initial_status()                        set search_path = pg_catalog, public;
alter function public.fn_ingredient_price_change_log()                  set search_path = pg_catalog, public;
alter function public.fn_stock_descuento_on_order_item()                set search_path = pg_catalog, public;
alter function public.fn_recipe_stock_descuento()                       set search_path = pg_catalog, public;
alter function public.fn_recipe_stock_reversion()                       set search_path = pg_catalog, public;
alter function public.fn_ingredient_cost_per_unit(p_ingredient_id uuid) set search_path = pg_catalog, public;
alter function public.fn_explode_ingredient(p_ingredient_id uuid, p_quantity numeric) set search_path = pg_catalog, public;
