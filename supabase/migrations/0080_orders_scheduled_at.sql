-- ============================================
-- Pedidos diferidos — `orders.scheduled_at` (spec 31)
--
-- "Pedí hoy para retirar mañana": un pedido online de retiro (pickup) puede
-- programarse a una fecha/hora futura. `scheduled_at` null = "para ahora"
-- (comportamiento de siempre); con valor futuro el pedido NO marcha al crearse
-- ni al aprobarse el pago — queda **agendado** (estado derivado: scheduled_at
-- futuro + pago aprobado + sin comandas) y marcha ~40 min antes vía cron o el
-- botón "marchar ahora". No se toca la máquina de estados.
--
-- Additive: columna nullable sin backfill — los pedidos existentes quedan en
-- null (= "para ahora"). RLS heredada: `orders` ya está scopeada por
-- `business_id`; una columna nueva no cambia las policies.
--
-- El índice (business_id, scheduled_at) sirve a las dos lecturas nuevas: la
-- vista "Próximos / agendados" de la operación y el cron que busca los
-- agendados a punto de marchar (where scheduled_at is not null and ...).
-- ============================================

alter table public.orders
  add column scheduled_at timestamptz;

comment on column public.orders.scheduled_at is
  'Pedido diferido (spec 31): fecha/hora futura de retiro. Null = para ahora. '
  'Si es futuro, el pedido no marcha hasta ~40 min antes (cron) o "marchar ahora".';

create index orders_business_scheduled_at_idx
  on public.orders (business_id, scheduled_at)
  where scheduled_at is not null;
