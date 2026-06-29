-- ============================================
-- Simplificación del modelo de estados de mesa
-- ============================================
-- Decisión 2026-05-08: pasamos de 5 a 3 estados de mesa para reducir
-- complejidad y eliminar transiciones que no aportaban valor.
--
-- Antes (5):  libre, ocupada, esperando_pedido, esperando_cuenta, limpiar
-- Ahora (3):  libre, ocupada, pidio_cuenta
--
-- Razones:
--
-- 1. `esperando_pedido` era un sub-estado de "ocupada" sin diferencia
--    operativa real. Lo absorbemos en `ocupada`.
--
-- 2. `limpiar` agregaba una transición intermedia obligatoria que en
--    la práctica nadie respetaba. Post-cobro la mesa va directo a `libre`.
--    El flag `business_settings.salon.usa_limpiar` queda obsoleto pero
--    sin downside (queda como dato en JSONB, no se lee más).
--
-- 3. `esperando_cuenta` se renombra a `pidio_cuenta` (más claro en jerga AR).
--
-- 4. `orders.bill_requested_at` se suma como timestamp persistente del
--    momento en que se pidió la cuenta. Es la verdad inmutable; el estado
--    de mesa es derivable (mesa.ocupada + order.bill_requested_at IS NOT NULL
--    ⇒ pidio_cuenta), pero mantenemos el estado por simplicidad operativa
--    y para color directo en el plano del salón.
--
-- Backfill:
--   esperando_pedido  → ocupada
--   esperando_cuenta  → pidio_cuenta (+ orders.bill_requested_at = now() para
--                        las orders open de esas mesas)
--   limpiar           → libre
--
-- Migraciones tocadas: 0023 (creación de operational_status). El default
-- sigue siendo 'libre'.
-- ============================================

-- ── 1. orders.bill_requested_at ──────────────────────────────
alter table public.orders
  add column if not exists bill_requested_at timestamptz;

create index if not exists orders_bill_requested_idx
  on public.orders (business_id, bill_requested_at desc)
  where bill_requested_at is not null;

-- ── 2. Backfill: bill_requested_at para mesas que ya pidieron cuenta ──
-- Antes de cambiar el check, encontramos las mesas con esperando_cuenta y
-- les seteamos el timestamp en su order activa. Si no tienen order open,
-- igual transicionamos la mesa (no hay nada que pierda).
update public.orders o
set bill_requested_at = now()
from public.tables t
where t.id = o.table_id
  and t.operational_status = 'esperando_cuenta'
  and o.lifecycle_status = 'open'
  and o.bill_requested_at is null;

-- ── 3. Backfill de los estados ───────────────────────────────
update public.tables
set operational_status = 'ocupada'
where operational_status = 'esperando_pedido';

update public.tables
set operational_status = 'pidio_cuenta'
where operational_status = 'esperando_cuenta';

update public.tables
set operational_status = 'libre',
    -- limpiar la mesa significa que pasó a libre — limpiamos opened_at y mozo_id.
    opened_at = null,
    mozo_id = null,
    current_order_id = null
where operational_status = 'limpiar';

-- ── 4. Reescribir el check constraint ────────────────────────
alter table public.tables
  drop constraint if exists tables_operational_status_check;

alter table public.tables
  add constraint tables_operational_status_check
  check (operational_status in ('libre', 'ocupada', 'pidio_cuenta'));
