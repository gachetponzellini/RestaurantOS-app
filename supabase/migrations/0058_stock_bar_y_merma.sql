-- ═══════════════════════════════════════════════════════════════════════
-- 0058_stock_bar_y_merma.sql — Spec 10: stock extendido al bar
--
-- Marca de "producto de stock de bar" sobre products, para listar/filtrar el
-- stock de barra (alfajores, turrón, etc.) aparte del de bebidas y de la cocina.
-- Es ortogonal a track_stock: un producto de bar usa la rama track_stock
-- (bebidas/contables) del descargo, no recetas.
--
-- NO crea tablas para merma: el reporte de merma reutiliza ingredient_consumptions
-- (migración 0051). Las policies RLS de stock_items/stock_movimientos/
-- ingredient_consumptions ya cubren el scope business_id; la columna nueva no
-- requiere policies nuevas (vive en products, ya scopeada).
-- ═══════════════════════════════════════════════════════════════════════

alter table products
  add column is_bar_stock boolean not null default false;

-- Índice parcial para listar el stock de bar de un negocio rápido.
create index products_bar_stock_idx
  on products(business_id)
  where is_bar_stock = true;
