-- ============================================
-- Menú del día: adicional por opción (choice upcharge).
--
-- Spec 29 / decisión Dgolf-house.2 — revierte D-MDR-1 (todas las opciones $0).
-- Cada opción `choice` de un combo puede tener un adicional (>= 0) que se
-- suma al `order_item` PADRE del combo; los hijos siguen en $0 (invariante de
-- `is_combo_component`, así reportes/caja/confirmación no cambian).
--
-- Additive: columna con default 0 y sin backfill — los combos existentes
-- quedan sin adicional. RLS heredada: las policies de daily_menu_components
-- derivan del menú padre (scope business_id), no cambian.
-- ============================================

alter table public.daily_menu_components
  add column extra_price_cents bigint not null default 0
    check (extra_price_cents >= 0);

comment on column public.daily_menu_components.extra_price_cents is
  'Adicional en centavos de esta opción (kind=choice). Se suma al order_item padre del combo; los hijos quedan en $0. Default 0 = incluida. Spec 29.';
