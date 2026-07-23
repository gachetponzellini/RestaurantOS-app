# Tasks — 056 Trasladar items entre cuentas

> Decisiones de alcance cerradas (2026-07-23): solo mesa **ocupada**, **no tocar cocina**, **admin/encargado**. Coordinar el arranque con la sesión de spec 054/055 (`orders/*`) y confirmar que la migración 0021 sigue libre.

## 0. Previo
- [ ] Crear la issue en GitHub y linkearla en `spec.md` + `wiki/log.md`.
- [ ] Confirmar número de migración libre (0021) tras el merge de 054/055.

## 1. Datos / migración (backend, TDD)
- [ ] `0021_trasladar_items.sql`: RPC `trasladar_items_tx` (SECURITY DEFINER, service_role, grants/revoke).
- [ ] Tabla de auditoría `order_item_moves` (order_item_id, from_order_id, to_order_id, actor_user_id, reason, moved_at) + RLS service-role-only.
- [ ] Validaciones/errcodes: `SAME_ORDER`, `CROSS_TENANT`, `DESTINATION_NO_OPEN_ORDER`, `STALE_STATE`, `ORDER_HAS_PAYMENTS`, `ITEM_IN_PAID_SPLIT`.
- [ ] Locks `FOR UPDATE` ordenados por id; expansión de combos; repunteo `order_id` (+ `seat_number=NULL`); borrado de splits de ambas; recálculo de totales de ambas.
- [ ] `comanda_items` **no** se toca (verificar en test).
- [ ] Aplicar migración al cloud (MCP) + `pnpm db:types`.

## 2. Dominio (TS)
- [ ] `traslado-items.test.ts` (rojo): combos, Zod, mapeo de errores, totales esperados, guard "misma orden origen".
- [ ] `trasladarItems()` en `src/lib/mozo/traslado-items.ts` (Zod + `canMoveItems` + resolver órdenes origen/destino + RPC + mapeo).
- [ ] `canMoveItems(role)` en `can.ts` (+ test) = admin/encargado.
- [ ] Recálculo con la fórmula de `calculateTotals()` (fuente única; no propagar fórmulas inconsistentes).
- [ ] Realtime: touch a ambas filas `tables` + `revalidatePath` mozo/operación.

## 3. Integración
- [ ] `traslado-items.integration.test.ts` (verde): mesa ocupada OK; `DESTINATION_NO_OPEN_ORDER`; bloqueo por pago; bloqueo por split pagado; `STALE_STATE`; `CROSS_TENANT`; combo padre→hijos; último item; **cocina intacta**.

## 4. UI
- [ ] Selección de item(s) en el detalle de cuenta (mozo `mesa/[id]` + admin/operación), visible solo admin/encargado.
- [ ] Modal "Mover a otra mesa" (variante de `TrasladarMesaModal`) con mesas destino = **solo ocupadas** + etiqueta.
- [ ] Overlay optimista + `onSuccess` refresh.

## 5. Cierre
- [ ] `pnpm typecheck` + `pnpm test` verde.
- [ ] Verificar en vivo con rol **encargado** (dos mesas ocupadas): totales de ambas, cocina sin cambios, realtime en ambas.
- [ ] Checklist qa-brain (web) — RLS con JWT del rol real.
- [ ] Actualizar `wiki/features/` (salón/mesas) + `wiki/specs/README.md` (fila 56) + `wiki/log.md`.
- [ ] Comentar + cerrar la issue; bump submódulo en el brain.
