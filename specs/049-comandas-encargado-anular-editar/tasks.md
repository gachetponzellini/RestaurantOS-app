# Tasks: 049 — Anular y editar comandas (encargado)

Leyenda: `[ ]` pendiente · `[x]` hecho.

## Datos
- [ ] **T001** Migración `0016_comanda_anulacion.sql` (aditiva: `comandas.cancelled_at/reason/by`). Aplicar al cloud (MCP) + `pnpm db:types`.

## Server — anular
- [ ] **T002** `cancelarComanda(slug, comandaId, motivo)` en `comandas/actions.ts` (FR-001..FR-006).
- [ ] **T003** Test `cancelarComanda`: gate mozo rechazado, scope cross-tenant, cancela ítems + comanda, setea `reprint_requested_at`, rechaza entregada/ya-anulada, recalcula total.

## Server — editar
- [ ] **T004** `editarItemComanda(slug, orderItemId, patch)` (FR-007..FR-010).
- [ ] **T005** Test `editarItemComanda`: gate, scope, cambio de cantidad/nota/producto (re-snapshot + recalculo), rechazo de combo/cancelado.
- [ ] **T006** `getSwappableProducts(slug, stationId)` — productos que rutean al sector (FR-012) + test de routing/scope.

## API / print-agent
- [ ] **T007** `GET /api/print-agent`: `cancelled` + `cancelled_reason` en el payload (FR-013) + test.
- [ ] **T008** `agent.mjs`: ticket **ANULADA** cuando `cancelled` (FR-014).

## Cliente
- [ ] **T009** `local-query.ts`: `LocalComandaItem.product_id` + `is_combo`; `LocalComanda.cancelled_at`.
- [ ] **T010** `comandas-kanban.tsx`: botones + `AnularComandaModal` (motivo) + `EditarComandaModal` (ítems + picker). Loading explícito (FR-011, FR-015).

## Cierre
- [ ] **T011** `pnpm typecheck` + `pnpm test` verdes.
- [ ] **T012** Verify en vivo con **rol real** (encargado): anular → ticket ANULADA; editar producto → ticket corregido. Actualizar `wiki/features/comandas.md` + `wiki/specs/README.md` + log. Comentar + cerrar issue #73.
