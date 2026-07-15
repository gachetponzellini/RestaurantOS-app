# Tasks — 042-enviar-comanda-idempotente

> Hermana del fix de cobro (0007). El test de idempotencia es de integración (necesita la columna aplicada), así que migración → implementación → test contra el cloud.

## 1. Migración + tipos
- [x] **T001** `0009_order_items_client_line_key.sql`: `add column client_line_key uuid` + índice UNIQUE parcial `(order_id, client_line_key) where client_line_key is not null`. **Aplicada al cloud** (2026-07-14, MCP; columna + índice verificados). **FR-001**.
- [x] **T002** `database.types.ts`: `client_line_key` en Row/Insert/Update de `order_items` (edit quirúrgico). **FR-001**.

## 2. Server (enviarComanda)
- [x] **T003** `comandas/actions.ts`: `client_line_key?` en `EnviarComandaItem` y `EnviarComandaDailyMenuItem`. **FR-002**.
- [x] **T004** Dedup up-front: resolver `client_line_key` ya existentes en la orden (`dispatchedKeyToItemId`) y saltear esas líneas (producto + combo). **FR-003**.
- [x] **T005** Insertar `client_line_key` en el `order_item` (producto + padre de combo); manejar `23505` → saltear la línea sin abortar. **FR-002/004**.
- [x] **T006** Respuesta idempotente: mergear a `comanda_ids` las comandas de las líneas ya despachadas. **FR-005**.

## 3. Cliente
- [x] **T007** `pedir-client.tsx` (`handleSend`): mandar `c._key` como `client_line_key` en cada línea (producto + menú del día). Comentario del catch actualizado (ya no "no idempotente"). **FR-006**.

## 4. Test (TDD)
- [x] **T008** `comandas.integration.test.ts`: reenviar el mismo carrito (mismos `client_line_key`) → 1 order_item, 1 comanda, total no doblado, `comanda_ids` estables. 12/12 verde. **SC-001/002**.
- [x] **T009** Casos existentes (dos productos iguales con keys distintos → 2 ítems + batch incremental) siguen verde. **SC-003**.

## 5. Verify
- [x] **T010** `pnpm typecheck` limpio + `pnpm test` (comandas: 12 integración + 25 unit) en verde. **SC-004**.
- [x] **T011** Verify en vivo con rol real (mozo): doble-tap real de "Enviar" no duplica la comanda en cocina. **SC-005**. ✅ Validado por Juan (2026-07-14) → issue #59 cerrado.
- [ ] **T012** Cierre: actualizar feature [comandas](../../../../wiki/features/comandas.md) si aplica + `wiki/log.md` + comentar/cerrar #59 + bump submódulo.

## Notas
- **No es una RPC transaccional** como el cobro (0007). El cuerpo de `enviarComanda` es grande (validaciones + varios inserts) y envolverlo en un RPC era desproporcionado. La idempotencia se logra con el índice UNIQUE parcial (guarda dura) + chequeo up-front (dedup secuencial limpio). El único hueco vs. RPC: si el proceso muere entre inserts, puede quedar un envío parcial (recuperable reenviando) — pero **nunca** duplica, que es el bug que importa.
