# Tasks — 048 Trasladar mesa (Fase 1: destino libre)

TDD: cada bloque de lógica/dinero/estado arranca con test rojo. Tests de integración contra la DB cloud real (patrón `src/lib/mozo/asignacion.integration.test.ts`: `@vitest-environment node`, `CURRENT_USER_ID` mutable, seed de business+floor_plan+tables+business_users).

## Migración y RPC

- [ ] **T001** Migración `0015_trasladar_mesa.sql`: ampliar CHECK de `tables_audit_log.kind` a incluir `'move'`.
- [ ] **T002** En la misma migración: `CREATE FUNCTION trasladar_mesa_tx(...)` con los 10 pasos del `plan.md` (lock `FOR UPDATE`, guard destino + catch `23505`→`DESTINATION_OCCUPIED`, swap A/B, mover reserva seated, audit ×2).
- [ ] **T003** En la misma migración: `REVOKE ... FROM public, anon, authenticated` + `GRANT EXECUTE ... TO service_role`.
- [ ] **T004** Aplicar `0015` al cloud (MCP `apply_migration`) + `pnpm db:types`.

## Co-requisito (dinero) — TESTS PRIMERO

- [ ] **T005** [test rojo] Integración: **cobro final concurrente con move** sobre la misma orden → assert exactamente una mesa ocupada antes del cierre y **cero mesas huérfanas** después (ninguna `ocupada` apuntando a orden cerrada). Este test debe fallar con el código actual.
- [ ] **T006** Fix `closeOrderIfFullyPaid` (`cobro-actions.ts:194-212`): liberar mesa por `.eq('current_order_id', orderId)` en vez de `.eq('id', order.table_id)`; idem completar reserva seated. T005 pasa a verde.

## RPC / lógica de traslado — TESTS PRIMERO

- [ ] **T007** [test rojo] Integración ruta feliz: A ocupada (orden + items + comandas) → move A→B libre → `orders.table_id=B`, A libre+limpia, B ocupada con `current_order_id`, `opened_at` y `mozo_id` heredados de A; audit ×2 `kind='move'`.
- [ ] **T008** [test rojo] `order_items`/`comandas`/`payments`/`splits`/totales/`tip_cents`/`bill_requested_at` **sin cambios** tras el move.
- [ ] **T009** [test rojo] A en `pidio_cuenta` (`bill_requested_at` set) → B queda `pidio_cuenta`.
- [ ] **T010** [test rojo] Cobro parcial (`payments 'paid'`) en A → tras move sigue por `order_id` con `caja_id`/`attributed_mozo_id` intactos; rendición del mozo sin cambios.
- [ ] **T011** [test rojo] Destino **ocupado** → `DESTINATION_OCCUPIED`, cero cambios de estado.
- [ ] **T012** [test rojo] Concurrencia: `enviarComanda(B)` que aterriza entre guard y update → uno gana, el move devuelve `DESTINATION_OCCUPIED` limpio (no `23505` crudo), rollback total.
- [ ] **T013** [test rojo] `SAME_TABLE` (A===B) y `STALE_STATE` (`p_expected_order_id` no coincide / doble-tap) → error, no-op.
- [ ] **T014** [test rojo] Cross-tenant: A o B de otro `business` → rechazo.
- [ ] **T015** [test rojo] Pedido diferido/scheduled (`table_id=NULL`) nunca entra al path del move (guard/assert).
- [ ] **T016** [test rojo] Destino `is_bar=true` libre → move válido.
- [ ] **T017** Implementar el RPC hasta que T007–T016 estén en verde.

## Server action + permisos — TESTS PRIMERO

- [ ] **T018** [test rojo] `canMoveTable`: encargado/admin true; mozo/otros false. Unit test en `can.test.ts`.
- [ ] **T019** [test rojo] Integración: server action `trasladarMesa` con rol `mozo` → error de permiso, cero cambios.
- [ ] **T020** [test rojo] Invocación directa del RPC con cliente rol `authenticated` → falla por permiso de ejecución (verifica `REVOKE`).
- [ ] **T021** `canMoveTable` en `src/lib/permissions/can.ts`.
- [ ] **T022** Server action `trasladarMesa` en `src/lib/mozo/actions.ts` (molde `transferTable`): auth+rol, `loadTableForBusiness` A y B, resolver orden open para `p_expected_order_id`, llamar RPC, mapear errores a mensajes UI, `revalidatePath`.

## Notificaciones

- [ ] **T023** Registrar `mesa.moved` en `NOTIFICATION_EVENTS` (`notifications/preferences.ts`) + render en `notifications/view.ts`.
- [ ] **T024** [test rojo→verde] El move emite `mesa.moved` (broadcast encargado + puntual al mozo), sin notificar al actor.

## UI

- [ ] **T025** Botón "Trasladar mesa" en el panel de acciones de mesa (mozo + salón admin), visible solo para encargado/admin.
- [ ] **T026** Picker de mesa destino: solo mesas sin orden open; marcar reservas `confirmed` próximas con confirmación extra.
- [ ] **T027** Suscribir `comandas-kanban` a `orders`/`tables` para re-etiquetar la mesa tras el move (sin reimpresión).
- [ ] **T028** UI optimista del estado de mesas + rollback ante `DESTINATION_OCCUPIED` con `router.refresh`.

## Cierre

- [ ] **T029** `pnpm typecheck` + `pnpm test` en verde.
- [ ] **T030** Verify en vivo con **rol real (encargado)**: trasladar una mesa con pedido a una libre; confirmar cuenta, demora y KDS. Probar destino ocupado.
- [ ] **T031** Actualizar `wiki/features/mozo.md` y `wiki/features/mesas-qr.md` (nueva acción) + `wiki/log.md`.
- [ ] **T032** Comentar y cerrar issue #72; tildar tasks.

## Notas de QA (aprendidos a vigilar)

- Invariante post-move: nunca (`operational_status='libre'` con orden open) ni (`current_order_id` → orden cerrada/cancelada).
- `enviarComanda(A)` stale tras move → orden fantasma en A: mitigar por realtime refresh; documentar el borde.
- `opened_at` NULL en A → B queda con `opened_at` NULL: verificar que reports (`reports-query.ts:718`) lo tolere.
