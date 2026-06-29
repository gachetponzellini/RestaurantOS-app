-- ═══════════════════════════════════════════════════════════════════════
-- 0083 — La comanda recuerda si no se pudo imprimir (spec 33)
--
-- El print agent (spec 28) imprime las comandas `pendiente` y confirma
-- (`pendiente → en_preparacion`). Si la impresión falla (impresora apagada, sin
-- papel, IP mal), la comanda queda `pendiente` y se reintenta — pero hasta ahora
-- nadie se enteraba. El spec 33 agrega un **aviso de fallo** (notificación
-- `comanda.impresion_fallida`, feed del spec 27) y necesita un flag para:
--   1. **Dedup** — notificar UNA sola vez por comanda, no en cada reintento.
--   2. **Visibilidad** — el kanban puede marcar las comandas que no se imprimieron.
--
-- `print_failed_at`: se setea al primer `result:"failed"` reportado por el agente;
-- mientras esté seteado, no se re-notifica; se limpia (null) al confirmar la
-- impresión (`result:"ok"` → `en_preparacion`). Null = sin fallo pendiente.
--
-- Aditivo, nullable, sin backfill. RLS heredada (members 0025 + platform 0033) —
-- no se tocan policies. NO es un estado: la máquina de comandas no cambia.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.comandas
  add column if not exists print_failed_at timestamptz;

comment on column public.comandas.print_failed_at is
  'Spec 33: marca que el print agent no pudo imprimir esta comanda. Se setea al '
  'primer fallo reportado (dedup del aviso comanda.impresion_fallida) y se limpia '
  'al confirmar la impresión. Null = sin fallo pendiente.';
