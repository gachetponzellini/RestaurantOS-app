# Tasks: Auto-march solo si el pedido está pagado

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Issue**: [#66](https://github.com/gachetponzellini/RestaurantOS-app/issues/66)

## Fase A — Tests

- [x] **T001** `src/lib/orders/persist-order.integration.test.ts` — reforzado el test "creates a pickup order": tras crear un pedido cash pickup, assert de **0 comandas** (`comandas` por `order_id`) y que el history **no** contiene `preparing`. **FR-001 / SC-001**. _Desvío del plan:_ se reforzó el integration existente en vez de un unit con spy de `routeOrderToCocina` — `persistOrder` es monolítica (supabase real) y un unit con mock sería frágil. Nota: el integration es seed-gated (`skipIf(!seedReady)`, `pizzanapoli`), así que en CI sin seed se saltea; la red CI-always del cambio es el guard T003.
- [x] **T003** `src/lib/orders/update-status.test.ts` — unit puro de `isOnlinePendingAdvance` (status.ts): bloquea avanzar un `pending` online (pickup/delivery), permite cancelar, no aplica a `dine_in` ni a estados posteriores. 4 casos. **FR-006 / SC-002**. _Corre siempre en CI._ También se renombró el test `"allows auto-march: pending → preparing"` (nombre obsoleto) a `"allows pending → preparing"`.
- [ ] **T002** `confirm-order.test.ts` — **no agregado.** `confirmarPedido` no se modificó en este spec (solo pasó a ser el camino principal del efectivo); su comportamiento se valida en el verify en vivo (T012). Gap de cobertura preexistente anotado.
- [ ] **T004** test del webhook MP — **no agregado.** El webhook (`mp/webhook/route.ts`) no cambió; testearlo es cobertura de código preexistente, fuera del alcance de este cambio. Gap anotado.

## Fase B — Implementación

- [x] **T005** `src/lib/orders/persist-order.ts` — eliminado el bloque de auto-march cash (líneas 719-729) + imports huérfanos (`routeOrderToCocina`, `isScheduledForLater`); comentario con la regla nueva. **FR-001**.
- [x] **T006** `src/lib/orders/status.ts` + `update-status.ts` — `isOnlinePendingAdvance` (status.ts) + guard en `updateOrderStatus` que rechaza avanzar un `pending` online (no dine-in) con mensaje "Usá Confirmar…"; se agregó `delivery_type` al select. **FR-006**.
- [x] **T007** `src/components/admin/order-detail-sheet.tsx` — prop `onConfirm`; footer bifurcado: para `pending` online el botón "Confirmar" llama `onConfirm(order)` (→ `confirmarPedido` → `routeOrderToCocina`) en vez de `onAdvance(→confirmed)`. **FR-005**.
- [x] **T008** `src/components/admin/order-card.tsx` — pasa `onConfirm={onConfirm}` al `<OrderDetailSheet>`. **FR-005**.

## Fase C — Verde + docs

- [x] **T009** `pnpm typecheck` (0 errores) + `pnpm test` (665 pass, 6 skipped; 1 timeout flaky de cloud en `cuenta.integration`, verde 11/11 aislado con `--testTimeout=30000`). **SC-005**.
- [x] **T010** Docs: `wiki/features/comandas.md` (contradicción dura, L195) y `wiki/features/pagos.md` (L163) corregidas. **SC-005**.
- [x] **T011** Docs: notas de actualización en `wiki/specs/05-…/` (proposal/spec/design/tasks) y `wiki/specs/31-…/` (design/proposal/tasks); `wiki/preguntas-abiertas.md` (pregunta movida a "Resueltas"); `wiki/features/admin.md` (L58) y `wiki/overview.md` (L121) enriquecidos.

## Fase D — Verify + cierre

- [ ] **T012** Verify en vivo con rol real (encargado) + print-agent: (a) crear takeaway/delivery efectivo → «Nuevos», 0 comandas, notif; nada impreso; (b) marchar desde la card **y** desde el detalle → crea comandas, imprime, `preparing`; (c) MP-paid → marcha solo; (d) dine-in y diferidos sin cambios. **SC-001..004**.
- [ ] **T013** Cierre (tras verify): commit en submódulo `code/RestaurantOS` (`closes #66`), bump del puntero en el brain, comentar + cerrar issue #66, entrada nueva en `wiki/log.md` tipo `code`.

> **T012** requiere sesión con rol real (encargado) + print-agent → verificación manual de Juan antes de cerrar el issue. **T013** (commit/push/close) espera el OK de Juan tras el verify.
