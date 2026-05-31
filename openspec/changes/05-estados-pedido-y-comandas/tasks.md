# Tareas — 05-estados-pedido-y-comandas Colapsar estados y auto-march a cocina

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.

## 1. Datos (si aplica)
- [ ] (Opcional, según Pregunta abierta) Migración `supabase/migrations/0052_orders_auto_march.sql`
      con `orders.auto_march boolean not null default false` + comentario; policies RLS heredadas de
      `orders` (scope `business_id`). Sólo si se prefiere flag explícito en vez de derivar de
      `delivery_type`.
- [ ] Si se agrega la columna: `pnpm db:types` → `src/lib/supabase/database.types.ts`.
- [ ] No se borran valores de enum (`ready`, `en_preparacion`) — se conservan por compatibilidad.

## 2. Dominio (TDD)
- [ ] Test (rojo): `src/lib/orders/status.test.ts` — el flujo del salón no exige pasar por `ready`
      para llegar a `delivered` (transiciones del salón colapsadas).
- [ ] Test (rojo): `src/lib/comandas/actions.test.ts` (o integration) — `marcarComandaEntregada`
      acepta como origen tanto `pendiente` como `en_preparacion` y deja la comanda `entregado`.
- [ ] Test (rojo): auto-march — un pedido `delivery_type != 'dine_in'` genera comandas y queda en
      `preparing` sin gesto manual; reintento es idempotente (no duplica comandas).
- [ ] Implementar: ajustar `src/lib/comandas/actions.ts::marcarComandaEntregada` para aceptar
      `pendiente|en_preparacion`.
- [ ] Implementar: disparar auto-march en el punto de confirmación/pago reutilizando el ruteo de
      `confirm-order.ts` (`resolveStation` + `createComandasForItems`); dejar `confirmarPedido` como
      fallback manual idempotente.
- [ ] Ajustar `src/lib/orders/status.ts` y `src/lib/orders/status-meta.ts`: `ready` fuera del flujo del
      salón; mapear `{pendiente, en_preparacion} → "activa"`, `{entregado} → "cerrada"`.

## 3. UI
- [ ] `src/components/mozo/order-summary-card.tsx`: quitar el botón "Empezar"; dejar sólo "Entregar"
      (un gesto). Mostrar la comanda como "activa"/"cerrada".
- [ ] Mostrar en la comanda de pedidos online el estado de pago (pagado / paga efectivo).

## 4. Verify
- [ ] `pnpm typecheck` y `pnpm test` en verde (incluida la suite de comandas/orders).
- [ ] Revisión fresca de archivos tocados (orders + comandas + mozo).
- [ ] Marcar ✅ en `openspec/changes/README.md`.
