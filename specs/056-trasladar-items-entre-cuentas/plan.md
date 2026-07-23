# Plan técnico — 056 Trasladar items entre cuentas

**Design gate**: toca **dinero + estados de orden** → TDD obligatorio (test rojo antes de implementación), verificación con rol real (encargado, nunca service_role). Migración versionada + RLS. Importes en centavos, timezone AR.

Con las decisiones de alcance cerradas (solo mesa ocupada, no tocar cocina, encargado/admin), la operación se reduce a **mover `order_items` entre dos órdenes abiertas y recalcular totales**. Sin crear órdenes, sin lógica de comandas.

## Arquitectura

```
UI (detalle de cuenta) → trasladarItems() [server action: rol + Zod]
   → RPC trasladar_items_tx() [migración 0021, SECURITY DEFINER, service_role]
        · lock FOR UPDATE de ambas órdenes (ordenadas por id)
        · validaciones (guardas de plata/estado)
        · repunteo order_items.order_id (+ combos) + borrado de splits
        · recálculo de totales de ambas órdenes
        · audit en order_item_moves
   → post-RPC en TS: touch a ambas filas `tables` (realtime) + revalidatePath
```

### 1. Migración `0021_trasladar_items.sql` — RPC `trasladar_items_tx`

```sql
trasladar_items_tx(
  p_business_id uuid,
  p_from_order_id uuid,
  p_to_order_id uuid,             -- ya resuelta en TS (orden abierta del destino)
  p_order_item_ids uuid[],        -- líneas a mover (padres de combo; hijos se expanden dentro)
  p_expected_from_order_id uuid,  -- anti estado-corrido
  p_actor_user_id uuid,
  p_reason text
) returns jsonb  -- { moved_item_ids, from_total_cents, to_total_cents }
```

Lógica:
1. **Locks**: `SELECT ... FOR UPDATE` de las dos órdenes **ordenadas por id** (evita deadlock con otro traslado / con `registrar_pago_tx`).
2. **Validaciones** (raise exception con texto-errcode, mapeadas en TS):
   - `SAME_ORDER` si `from == to`.
   - `CROSS_TENANT` si alguna orden no es de `p_business_id`.
   - `DESTINATION_NO_OPEN_ORDER` si la orden destino no existe / no está `open` (la mesa estaba libre — se filtra en TS, pero se re-valida acá).
   - `STALE_STATE` si la orden origen ≠ `p_expected_from_order_id`, o si algún `p_order_item_ids` no está en la orden origen o está `cancelled_at IS NOT NULL`.
   - `ORDER_HAS_PAYMENTS` si `from.total_paid_cents > 0` (o `from`/`to` no `open`).
   - `ITEM_IN_PAID_SPLIT` si algún item ∈ `order_split_items` de un `order_splits.status='paid'`.
3. **Expandir combos**: sumar a la selección los `order_items` con `parent_order_item_id` ∈ selección.
4. **Repunteo**: `UPDATE order_items SET order_id = p_to_order_id, seat_number = NULL WHERE id = ANY(expanded)`. Los `order_item_modifiers` viajan solos (FK a `order_item_id`). **`comanda_items` NO se toca** (decisión "no tocar cocina").
5. **Borrar splits de ambas** (`order_splits`/`order_split_items` de from y to) — como FR-07 bloqueó splits pagados, es seguro. Reusar la lógica de `deleteSplitsAndItems`.
6. **Recálculo de totales** de ambas órdenes. Para no duplicar la fórmula de `calculateTotals()` en SQL, la RPC deja `subtotal_cents`/`total_cents` recomputados desde `order_items` vivos (subtotal + tip + fee − discount, la fórmula de `totals.ts`) — **o** se recalcula en TS post-RPC con `recalcOrderTotals()`. **Preferencia: recalcular dentro de la RPC** con la fórmula explícita (atomicidad total; documentar que replica `calculateTotals`). Cerrar en implementación evitando propagar la fórmula inconsistente de `enviarComanda`.
7. **Audit**: `INSERT INTO order_item_moves(order_item_id, from_order_id, to_order_id, actor_user_id, reason, moved_at)` una fila por item movido. Tabla nueva, RLS service-role-only.
8. **Return** jsonb con ids + totales.

Grants: `revoke ... from anon, authenticated`; `grant execute ... to service_role`.

### 2. Server action `trasladarItems()` — `src/lib/mozo/traslado-items.ts`

- Zod: `{ orderItemIds: string[].min(1), toTableId: uuid, slug, reason?: string }`.
- `requireMozoActionContext` + **`canMoveItems(role)`** (nuevo en `can.ts`, = admin/encargado).
- Resolver `business`; validar que ambas mesas son del negocio; obtener la **orden origen abierta** de los items (todos deben compartir la misma orden origen → si no, error) para `p_expected_from_order_id`; obtener la **orden destino abierta** de `toTableId` (si no hay → `DESTINATION_NO_OPEN_ORDER` antes de la RPC).
- Llamar RPC → `mapTrasladarItemsError` (patrón `mapTrasladarMesaError`).
- **Realtime**: como el salón sólo escucha `tables` ([use-tables-realtime.ts:23](../../src/lib/mozo/use-tables-realtime.ts)) y aquí ninguna fila de `tables` cambia, hacer un **touch** (`UPDATE tables SET updated_at = now()` — o el patrón que dispare el postgres_changes) a ambas mesas para forzar el refresh de los otros clientes. `revalidatePath('/{slug}/mozo')` + `/admin/operacion`.

### 3. Permisos — `src/lib/permissions/can.ts`
- `canMoveItems(role)` → `admin || encargado`. Tests en `can.test.ts`.

### 4. UI — detalle de cuenta
- En la vista donde se listan los items de la mesa (mozo `mesa/[id]` + admin/operación): selección de item(s) + acción "Mover a otra mesa" (sólo visible para admin/encargado).
- Modal variante de `TrasladarMesaModal` con lista de mesas destino = **sólo ocupadas** (distintas de la origen), mostrando etiqueta. Resumen de confirmación ("Mover Milanesa → Mesa 6").
- `onSuccess` → overlay optimista + `router.refresh()`.

## Tests (TDD)

- **Unidad** (`traslado-items.test.ts`): expansión de combos, Zod, mapeo de errcodes, fórmula de totales esperada, guard "todos los items de la misma orden origen".
- **Integración** (`traslado-items.integration.test.ts`, contra DB cloud como los demás `.integration`):
  - mover a mesa ocupada → totales de ambas OK, item no duplicado, mesas siguen ocupadas;
  - `DESTINATION_NO_OPEN_ORDER` (destino libre);
  - `ORDER_HAS_PAYMENTS` y `ITEM_IN_PAID_SPLIT`;
  - `STALE_STATE` (item ya movido);
  - `CROSS_TENANT`;
  - combo padre arrastra hijos + modificadores;
  - último item movido → origen open total 0;
  - **cocina intacta**: no se crean/anulan comandas; el `order_item` movido conserva `kitchen_status` y su `comanda_items` viejo.

## Riesgos / decisiones a cerrar en implementación

- **Recálculo de totales**: usar la fórmula de `calculateTotals()` y NO propagar las fórmulas inconsistentes de `enviarComanda`/`cancelarItem` (subtotal vs subtotal±tip/discount). Si conviene, unificar de paso o abrir issue aparte.
- **Comanda histórica huérfana**: verificar que dejar `comanda_items` apuntando a un item que ahora es de otra orden no rompe el KDS ([comandas-kanban](../../src/components/admin/local/comandas-kanban.tsx)) ni las vistas de cuenta. Si el KDS derivara items por `order_id`, chequear que no desaparezca/duplique. (Es el trade-off "no tocar cocina".)
- **Todos los items de una misma orden origen**: el MVP asume una única mesa origen por operación (la UI mueve desde una cuenta). Validar en action + RPC.
- **Coordinación con spec 054/055** (sesión paralela en `orders/`): toca `order_items`/`orders` y quizás `src/lib/mozo/`. Sincronizar el merge; confirmar que 0021 sigue libre.
