# Implementation Plan: 049 — Anular y editar comandas (encargado)

## Enfoque

Todo se monta sobre mecanismos que ya existen: la **reimpresión = flag lateral** del spec 35 (`reprint_requested_at`) sirve tanto para el ticket ANULADA como para el ticket corregido; el **auto-ocultado de comandas fantasma** del kanban hace que una comanda anulada desaparezca sola. No se toca la máquina de estados (`pendiente → en_preparacion → entregado`) ni `can.ts` (se reusan `canCancelItem` / `canModifyPostEnvio`).

## Capas

### Datos
- Migración `0016_comanda_anulacion.sql` (aditiva): `comandas.cancelled_at` / `cancelled_reason` / `cancelled_by`. Sin RLS nueva.

### Server (dominio)
- `cancelarComanda(slug, comandaId, motivo)` en [`comandas/actions.ts`](../../src/lib/comandas/actions.ts): gate `canCancelItem`, cancela ítems vivos + marca comanda + `reprint_requested_at` + recalcula total + `notifyItemCancelled`.
- `editarItemComanda(slug, orderItemId, patch)` en el mismo archivo: gate `canModifyPostEnvio`, patch de quantity/notes/productId, re-snapshot de precio/nombre, limpia modifiers al cambiar producto, recalcula subtotal/total. Rechaza combos.
- `getSwappableProducts(slug, stationId)` — query nueva (co-ubicada en `comandas/queries.ts` o `catalog`): productos activos que rutean al sector.

### API / print-agent
- `GET /api/print-agent`: `select` suma `cancelled_at, cancelled_reason`; payload suma `cancelled` + `cancelled_reason` (aditivo).
- `print-agent/agent.mjs`: `ticketText` renderiza encabezado ANULADA + motivo cuando `c.cancelled`.

### Cliente
- `local-query.ts`: `LocalComandaItem` suma `product_id` + `is_combo`; `LocalComanda` suma `cancelled_at` (para no mostrar botones sobre una ya anulada en la ventana previa al refresh).
- `comandas-kanban.tsx`: botones **«Editar»** + **«Anular comanda»** en cards activas; modales `EditarComandaModal` (lista de ítems editables + picker de producto) y `AnularComandaModal` (motivo). Acciones con loading explícito (no optimista).

## Orden (TDD)
1. Migración.
2. `cancelarComanda` + test → `editarItemComanda` + test → `getSwappableProducts`.
3. GET print-agent (test del flag) + agent.mjs.
4. `local-query` extend.
5. UI kanban + modales.
6. `pnpm typecheck` + `pnpm test`.
7. Aplicar `0016` al cloud (MCP) + verify en vivo (encargado + print-agent).

## Riesgos
- **Snapshot de precio al cambiar producto**: usar `price_cents` actual del producto (mismo criterio que `enviarComanda`). No re-rutear sector.
- **Idempotencia de anulación**: chequear `cancelled_at` up-front → no-op.
- **Agente viejo**: sin el flag ANULADA reimprime el ticket normal — degradación aceptable (documentada en spec, FR-014).
- **WIP de 048 en el árbol**: 049 toca archivos distintos; al commitear se stagean solo los de 049.
