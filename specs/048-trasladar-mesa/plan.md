# Plan de implementación — 048 Trasladar mesa (Fase 1: destino libre)

**Spec**: [`spec.md`](./spec.md) · **Issue**: [#72](https://github.com/gachetponzellini/RestaurantOS-app/issues/72) · **Migración**: `0015`

## Estrategia: repunteo de la orden, no re-creación

Mover = `UPDATE orders SET table_id = B` + swap de las dos mesas. **No se crea orden nueva** — recrear obligaría a reescribir `order_id` en payments/splits/items/comandas y rompería los agregados de caja y la reconciliación del webhook de MP. Todo el contenido cuelga de `order_id` y viaja solo.

## Transaccionalidad: RPC Postgres, no writes sueltos de supabase-js

Los `UPDATE` de supabase-js **no comparten transacción**; un fallo a mitad deja el "estado imposible" (mesa libre con orden abierta / puntero colgado). Por eso todo el traslado va en **una función plpgsql** `trasladar_mesa_tx(...)`, molde `registrar_pago_tx` (`0007_cobro_idempotente_transaccional.sql`), con `FOR UPDATE` sobre la orden.

### RPC `public.trasladar_mesa_tx`

Firma tentativa:

```
trasladar_mesa_tx(
  p_business_id   uuid,
  p_from_table_id uuid,
  p_to_table_id   uuid,
  p_expected_order_id uuid,   -- la orden que la UI creía mover (anti doble-tap / stale)
  p_actor_user_id uuid,
  p_reason        text
) returns uuid   -- order_id movido
```

Pasos dentro de la transacción:

1. Validar `p_from_table_id <> p_to_table_id` → si no, `RAISE 'SAME_TABLE'`.
2. Validar que **ambas** mesas pertenecen a `p_business_id` (join `floor_plans.business_id`) → si no, `RAISE 'CROSS_TENANT'`.
3. `SELECT ... FROM orders WHERE table_id = p_from_table_id AND lifecycle_status='open' FOR UPDATE` (ordenar por `id` para evitar deadlock si se lockea más de una fila).
   - Sin fila → `RAISE 'NO_OPEN_ORDER'`.
   - `id <> p_expected_order_id` → `RAISE 'STALE_STATE'` (doble-tap / cambió la orden).
4. Guard de destino: `IF EXISTS(SELECT 1 FROM orders WHERE table_id = p_to_table_id AND lifecycle_status='open')` → `RAISE 'DESTINATION_OCCUPIED'`. (Pre-check amable; el garante real es el índice único + el catch del paso 5.)
5. `UPDATE orders SET table_id = p_to_table_id WHERE id = <order>` **envuelto en** handler `WHEN unique_violation THEN RAISE 'DESTINATION_OCCUPIED'` — cierra el TOCTOU contra un `enviarComanda(B)` que se cuele entre el guard y el update.
6. `UPDATE tables` A (origen): `operational_status='libre'`, `current_order_id=NULL`, `opened_at=NULL`, `mozo_id=NULL`. Guardar `opened_at`/`mozo_id` viejos en variables antes.
7. `UPDATE tables` B (destino): `current_order_id=<order>`, `operational_status = CASE WHEN <order>.bill_requested_at IS NOT NULL THEN 'pidio_cuenta' ELSE 'ocupada' END`, `opened_at=<opened_at viejo de A>`, `mozo_id=<mozo_id viejo de A>`.
8. `UPDATE reservations SET table_id = p_to_table_id WHERE table_id = p_from_table_id AND status='seated' AND business_id = p_business_id`.
9. `INSERT tables_audit_log` × 2 (`kind='move'`, cruzados).
10. `RETURN <order_id>`.

**Seguridad** (obligatorio, espejo de la migración 0004):

```sql
revoke all on function public.trasladar_mesa_tx(uuid,uuid,uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.trasladar_mesa_tx(uuid,uuid,uuid,uuid,uuid,text) to service_role;
```

La autorización de rol (encargado/admin) vive en la **server action** TS, único caller vía service client.

## Migración `0015_trasladar_mesa.sql`

1. `ALTER TABLE tables_audit_log DROP CONSTRAINT tables_audit_log_kind_check`, recrear con `kind IN ('assignment','status','transfer','move')`.
2. `CREATE OR REPLACE FUNCTION public.trasladar_mesa_tx(...)` (arriba).
3. `REVOKE`/`GRANT` de la función.

Aplicar al cloud (`tjfufswzsxfujcpoxapx`) vía MCP de Supabase (`apply_migration`). Regenerar tipos (`pnpm db:types`).

## Co-requisito crítico — `closeOrderIfFullyPaid`

**Archivo**: `src/lib/billing/cobro-actions.ts:194-212`. Cambiar la liberación de mesa de:

```ts
.eq("id", order.table_id)          // ❌ table_id stale: si hubo un move, libera la mesa equivocada
```

a:

```ts
.eq("current_order_id", orderId)   // ✅ libera SIEMPRE la mesa dueña actual de la orden; idempotente, move-agnóstico
```

Idem para completar la reserva `seated` (usar la mesa cuyo `current_order_id` es la orden, no el `table_id` stale). Sin esto, la carrera cobro-final + move deja una mesa fantasma (ver spec, Edge Cases 🔴).

## Server action — `src/lib/mozo/actions.ts::trasladarMesa`

Molde: `transferTable` (`actions.ts:556-671`). Pasos:

1. `getBusiness(slug)` + `requireMozoActionContext` (auth + rol).
2. Permiso: **encargado/admin** — nuevo `canMoveTable(role)` en `src/lib/permissions/can.ts` (o reuso del criterio de `canTransitionMesa`).
3. `createSupabaseServiceClient`.
4. `loadTableForBusiness` para A **y** B (defensa cross-tenant vía `floor_plans.business_id`).
5. Resolver la orden open de A para pasar `p_expected_order_id`.
6. Llamar `rpc('trasladar_mesa_tx', {...})`. Mapear errores (`DESTINATION_OCCUPIED`, `NO_OPEN_ORDER`, `SAME_TABLE`, `STALE_STATE`, `CROSS_TENANT`) a `actionError` con mensajes de UI.
7. Notificación `mesa.moved` (nuevo tipo — registrar en `NOTIFICATION_EVENTS` de `notifications/preferences.ts` y render en `notifications/view.ts`): broadcast encargado + puntual al mozo, `actorUserId` para no auto-notificar.
8. `revalidatePath('/mozo')` + `revalidatePath('/admin/operacion')`.

## UI

- **Botón "Trasladar mesa"** en el panel de acciones de la mesa (mozo y salón admin). Solo visible para encargado/admin.
- **Picker de mesa destino**: reusar el patrón del selector de asignación de mozo / plano de salón. Ofrecer solo mesas **sin orden open** (más estricto que `operational_status='libre'` para evitar drift). Marcar las que tengan reserva `confirmed` en las próximas ~2h ("libre · reservada 21:00") pidiendo confirmación extra.
- **Realtime del KDS**: como no se reimprime, el `comandas-kanban` no recibe evento (escucha `comandas`). Suscribirlo también a `orders` (o `tables`) para re-etiquetar la mesa tras el move. (`src/components/admin/local/comandas-kanban.tsx:265-281`.)
- **UI optimista** (spec 21) solo para el estado visual de las mesas; el rollback ante `DESTINATION_OCCUPIED` debe volver A y B atrás y disparar `router.refresh`.

## Archivos a tocar

| Archivo | Cambio |
|---|---|
| `supabase/migrations/0015_trasladar_mesa.sql` | **nuevo** — CHECK `move` + RPC + revoke/grant |
| `src/lib/mozo/actions.ts` | **nuevo** `trasladarMesa` server action |
| `src/lib/permissions/can.ts` | **nuevo** `canMoveTable` |
| `src/lib/billing/cobro-actions.ts` | **co-requisito** — liberar por `current_order_id` |
| `src/lib/notifications/preferences.ts` | registrar `mesa.moved` |
| `src/lib/notifications/view.ts` | render `mesa.moved` |
| `src/components/mozo/*` (panel de mesa) | botón + picker |
| `src/components/admin/salones/*` o `local/*` | botón en salón + suscripción realtime del KDS |
| `src/lib/database.types.ts` | regenerar (`pnpm db:types`) |

## Gates SDD

Dispara **plan.md obligatorio** (toca máquina de estados de mesa, cruza mozo+comandas+billing, y es plata-adyacente). TDD estricto (tests primero) por tocar estados y dinero.
