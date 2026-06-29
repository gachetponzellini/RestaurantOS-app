-- 0055: Caja de bar — mesa de venta directa, fuera del motor de reservas (spec 08)

-- Mesa de barra: vende directo (sin mozo, abre/cierra rápido) y queda FUERA del
-- motor de reservas (no se auto-asigna ni se ofrece para reservar — ver
-- getBusinessTables con `excludeBar`). Ortogonal a `status` (active/disabled).
--
-- El ruteo de comandas NO se toca: un item genera comanda según su sector/stock
-- como siempre, sea barra o salón. Los productos de barra (kiosco sin sector,
-- bebidas con track_stock) ya no imprimen; la sanguchería/tostados tienen sector
-- y sí imprimen. No hace falta un flag por sector.
alter table public.tables
  add column if not exists is_bar boolean not null default false;

-- Lookup de mesas de barra por plano. Índice parcial: solo indexa is_bar = true.
create index if not exists idx_tables_bar
  on public.tables (floor_plan_id)
  where is_bar;

-- RLS: `tables` ya tiene policies por business_id (vía floor_plans). La columna
-- nueva hereda ese scope; no hace falta policy nueva.
