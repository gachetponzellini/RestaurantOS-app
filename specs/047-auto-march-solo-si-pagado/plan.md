# Plan: Auto-march solo si el pedido está pagado

**Spec**: [spec.md](./spec.md) · **Issue**: [#66](https://github.com/gachetponzellini/RestaurantOS-app/issues/66)

## Enfoque

Cambio quirúrgico + un co-requisito de UI que el cambio destapa. Sin DB.

1. **Sacar el auto-march de la creación** (`persist-order.ts`). El único disparador automático pasa a ser el webhook MP (`paid`), que ya existe. El efectivo se marcha manual.
2. **Alinear los dos «Confirmar»**: la card ya rutea a cocina (`onConfirm`); el `OrderDetailSheet` no. Se le pasa `onConfirm` y se bifurca su footer para un `pending` online.
3. **Guard server** en `updateOrderStatus`: un `pending` online (no dine-in) no puede avanzar por cambio de columna — debe ir por `routeOrderToCocina`. Cierra la causa raíz (la state-machine permitía saltear la marcha) para cualquier UI futura.
4. **Tests** primero donde se pueda (TDD): hoy no hay red sobre este flujo.
5. **Docs** del wiki que contradicen el nuevo comportamiento.

## Archivos afectados

| Archivo | Cambio | FR |
|---|---|---|
| `src/lib/orders/persist-order.ts:719-729` | Eliminar bloque auto-march cash; comentario explicando la regla nueva | FR-001 |
| `src/components/admin/order-detail-sheet.tsx` | Prop `onConfirm`; footer bifurca «Confirmar» de un `pending` online a `onConfirm` | FR-005 |
| `src/components/admin/order-card.tsx:240-247` | Pasar `onConfirm` al `<OrderDetailSheet>` | FR-005 |
| `src/lib/orders/update-status.ts` | Guard: rechazar avance de `pending` online (no dine-in) — usar `confirmarPedido` | FR-006 |
| `src/lib/orders/*.test.ts` (nuevos/reforzados) | Tests de FR-001/002/005/006 | SC-005 |

## Decisiones

- **Eliminar el bloque, no gatearlo por `payment_status`**: en la creación ningún pedido está `paid` todavía (efectivo y MP nacen `pending`), así que un `if (payment_status === "paid")` sería código muerto. El caso "pagado" ya lo cubre el webhook. Se elimina el bloque y se documenta la intención en comentario.
- **Guard en `updateOrderStatus`, no solo el fix del sheet**: arreglar el sheet tapa el síntoma visible; el guard cierra la causa raíz (state-machine `pending→confirmed/preparing` sin rutear) para que no reaparezca por otra pantalla. Verificado que ninguna UI legítima avanza un `pending` online por `updateOrderStatus` tras el fix (webhook y cron usan `routeOrderToCocina`).
- **Tests mockeando `routeOrderToCocina`**: el integration test real está seed-gated (`skipIf(!seedReady)`, rara vez corre). El guard real anti-regresión es un unit que espía `routeOrderToCocina`.

## Riesgos y mitigaciones (del barrido adversarial)

- **Pérdida silenciosa (alto)** → FR-005 + FR-006, cubiertos por test. Co-requisito obligatorio: no shippear FR-001 solo.
- **Dependencia de gesto humano (bajo)** → objetivo de negocio; mitigado por notif `order.pending` + badge de «Nuevos». Se valida en el verify en vivo.
- **MP no pagado confirmable (bajo)** → `paymentBadge` como señal; gatear por pago queda como Non-Goal.

## Verificación

`pnpm typecheck` + `pnpm test` + verify en vivo con rol encargado: crear takeaway efectivo → «Nuevos» sin imprimir; marchar desde card y desde detalle → imprime; MP-paid → marcha solo.
