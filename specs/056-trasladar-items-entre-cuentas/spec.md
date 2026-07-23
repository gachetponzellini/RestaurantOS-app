# Feature Specification: Trasladar productos (order_items) sueltos de una cuenta a otra

**Feature Branch**: `056-trasladar-items-entre-cuentas`

**Created**: 2026-07-23

**Status**: 📋 Propuesto — decisiones de alcance cerradas con Juan (2026-07-23). Issue [#82](https://github.com/gachetponzellini/RestaurantOS-app/issues/82). Milestone: Post-demo · Growth & hardening. Extiende [048-trasladar-mesa](../048-trasladar-mesa/spec.md) (traslado de mesa completa) y reusa el recálculo de cuenta de `src/lib/billing/`.

**Input**: Pedido de Juan 2026-07-23 — *"el sistema no permite trasladar un producto a una mesa ocupada. Debería permitir, ya que los mozos suelen equivocarse y comandar en la mesa errónea, hay que solucionar esto de una manera elegante"*.

**Decisiones tomadas (2026-07-23)**:
1. **Alcance**: mover **productos sueltos** (uno o más `order_items`), no la mesa completa (el merge de mesa sigue descartado en 048).
2. **Destino**: **solo mesa OCUPADA** (con cuenta abierta). Para mover todo a una mesa libre ya está `trasladarMesa`. Mesa libre = fuera de alcance.
3. **Cocina**: el traslado **NO toca las comandas** — es puramente de cuenta/cobro. No anula ni re-imprime tickets; la comanda histórica queda en la mesa de origen (cocina ya preparó el plato). Trade-off aceptado: cocina no se entera del cambio de mesa.
4. **Permisos**: sólo **admin/encargado**.

## Contexto y problema

El mozo, en hora pico, comanda un producto (o una tanda) en la **mesa equivocada**. Ejemplo: marcha una milanesa en la Mesa 5 cuando era para la Mesa 6, que **ya está ocupada** con su cuenta abierta. Hoy no hay forma limpia de corregir a quién se le cobra:

- **`trasladarMesa`** (spec 048) mueve la orden **completa** y **sólo a una mesa libre**; si el destino está ocupado tira `DESTINATION_OCCUPIED`. El merge de dos cuentas se descartó a propósito ([mozo/actions.ts:699](../../src/lib/mozo/actions.ts)).
- **No existe** traslado de un item individual.
- El único workaround es **anular** el item (spec 34) y **recomandarlo** en la mesa correcta: doble trabajo, ensucia la cuenta con anulaciones y re-imprime.

Resultado: el consumo queda facturado a la mesa que no lo pidió.

### Lo que ya existe y se reusa

- **Modelo**: `order_items` cuelga de `order_id` (una FK). Tiene `unit_price_cents`/`subtotal_cents` (centavos, materializados en la fila), `quantity`, `kitchen_status`, soft-cancel (`cancelled_at`, spec 34), `station_id`, `parent_order_item_id`/`is_combo_component` (combos), `seat_number`. Modificadores en `order_item_modifiers` (FK a `order_item_id`, viajan solos). ([0001_baseline.sql:1392](../../supabase/migrations/0001_baseline.sql))
- **Cuenta/totales**: `calculateTotals()` ([billing/totals.ts](../../src/lib/billing/totals.ts)) es la fórmula canónica; `recalcOrderTotals()`/`deleteSplitsAndItems()` en [billing/cuenta-actions.ts](../../src/lib/billing/cuenta-actions.ts). Los totales **no** se materializan por trigger.
- **Pagos**: nivel orden (`total_paid_cents`) o split (`order_splits.status='paid'` + `order_split_items`). RPC `registrar_pago_tx` (0007) lockea la orden `FOR UPDATE`.
- **Índice** `orders_one_open_per_table` UNIQUE parcial `WHERE lifecycle_status='open' AND table_id IS NOT NULL` → una mesa ocupada tiene exactamente **una** orden abierta.
- **Patrón transaccional**: `trasladar_mesa_tx` (0015) — `SECURITY DEFINER`, `service_role`, lock `FOR UPDATE`, errcodes, audit en `tables_audit_log`.
- **Permisos**: `canMoveTable(role)` = admin/encargado ([permissions/can.ts:173](../../src/lib/permissions/can.ts)).

### Lo que falta (objeto de esta spec)

Seleccionar item(s) de la cuenta de una mesa y **moverlos** a la cuenta abierta de **otra mesa ocupada**, atómicamente, recalculando los totales de ambas cuentas, con guardas de plata y auditoría — sin anular ni recomandar, y sin tocar cocina.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Mover un producto a otra mesa ocupada (Priority: P1)

El encargado ve que en la Mesa 5 hay una milanesa que era para la Mesa 6 (ocupada). Selecciona la milanesa → "Mover a otra mesa" → Mesa 6 → confirma. La milanesa sale de la cuenta de la 5 y entra en la de la 6; ambos totales se ajustan. Cocina no recibe nada (el plato ya está hecho).

**Why this priority**: Es el caso central del pedido y el que hoy está bloqueado. Sin esto la feature no existe.

**Independent Test**: Con dos mesas ocupadas (orden A con item X, orden B abierta), `trasladarItems({ orderItemIds:[X], toTableId:<B>, slug })` con rol encargado → `order_items.order_id` de X pasa a B; `A.total_cents` baja y `B.total_cents` sube según `calculateTotals()`; se audita; X no queda duplicado ni cancelado; ninguna mesa cambia de estado.

**Acceptance Scenarios**:

1. **Given** Mesa 5 (orden abierta con milanesa $8000 + otros) y Mesa 6 (orden abierta), **When** el encargado mueve la milanesa a la 6, **Then** la milanesa cuelga de la orden de la 6, el total de la 5 baja $8000, el de la 6 sube $8000, y ambas mesas siguen `ocupada`.
2. **Given** la milanesa ya fue marchada a cocina, **When** se mueve, **Then** **no** se anula ni re-imprime ninguna comanda; la comanda histórica queda asociada a la Mesa 5; sólo cambia a qué cuenta se cobra el item. (`kitchen_status` del item se conserva.)
3. **Given** un combo (item padre + componentes), **When** se mueve el padre, **Then** viajan también sus componentes (`parent_order_item_id`) y sus modificadores.
4. **Given** dos operadores mueven a la vez, **When** el segundo llega con estado corrido (el item ya no está en la orden origen), **Then** falla con `STALE_STATE` ("El pedido cambió, refrescá e intentá de nuevo") y nada se mueve a medias.

### User Story 2 — Guardas de plata y estado (Priority: P1)

**Why this priority**: Mover items toca dinero; las guardas evitan corromper cobros.

**Acceptance Scenarios**:

1. **Given** la orden origen **ya tiene pagos** (`total_paid_cents > 0`) o el item está en un **split pagado**, **When** se intenta mover, **Then** se rechaza ("Cobrá o resolvé la cuenta antes de mover este producto"). No se tocan splits pagados.
2. **Given** la mesa destino está **libre** (sin orden abierta), **When** se intenta mover ahí, **Then** se rechaza (`DESTINATION_NO_OPEN_ORDER`: "Esa mesa no tiene una cuenta abierta. Para mover todo, usá Trasladar mesa"). El selector de destino ni siquiera ofrece mesas libres.
3. **Given** un item ya **cancelado** (`cancelled_at`), **When** se intenta mover, **Then** se rechaza.
4. **Given** origen y destino de **negocios distintos**, **Then** `CROSS_TENANT` → "Mesa no encontrada".
5. **Given** se movió el **último** item vivo de la orden origen, **Then** la orden origen queda `open` con total 0 y la mesa sigue `ocupada` (no se auto-cancela; el encargado la libera si corresponde).

### Edge Cases

- **Misma mesa/orden**: `SAME_ORDER` → error de validación.
- **Modificadores y notas**: viajan con el item (cuelgan de `order_item_id`).
- **Cantidad parcial** (mover 2 de 3 de una línea): **fuera de alcance** — se mueve la línea completa.
- **Comanda histórica en origen**: como no se toca cocina, el vínculo `comanda_items` del item movido queda apuntando a la comanda de origen (histórico). Verificar que el KDS no lo muestre de forma confusa ni lo cuente en la cuenta de origen (los totales usan `order_items.order_id`, no `comanda_items`).
- **Realtime entre dos mesas ocupadas**: ninguna fila de `tables` cambia → forzar refresh de ambas (ver plan.md).

## Requirements *(mandatory)*

### Functional Requirements

**Traslado (US1)**
- **FR-01**: El sistema DEBE permitir mover uno o más `order_items` no cancelados de la orden abierta de una mesa a la orden abierta de **otra mesa ocupada** del mismo negocio.
- **FR-02**: El destino DEBE tener una orden abierta (mesa ocupada). Si está libre → `DESTINATION_NO_OPEN_ORDER`. No se crean órdenes ni se ocupan mesas en esta feature.
- **FR-03**: El traslado **NO** modifica comandas: no anula, no re-imprime, no re-rutea. Sólo cambia `order_items.order_id`. La comanda histórica permanece asociada a la orden de origen.
- **FR-04**: El sistema DEBE recalcular `subtotal_cents`/`total_cents` de **ambas** órdenes con `calculateTotals()` (fuente única) en la misma transacción, y borrar los splits de ambas (respetando FR-06).
- **FR-05**: Los **combos** DEBEN viajar completos (padre + `parent_order_item_id`); los **modificadores** viajan con cada item.

**Guardas (US2)**
- **FR-06**: Operación **atómica** (RPC transaccional): o se mueve todo el conjunto o nada. Lock `FOR UPDATE` de ambas órdenes (ordenadas por id, anti-deadlock; serializa contra el cobro).
- **FR-07**: DEBE **rechazar** si la orden origen tiene pagos (`total_paid_cents > 0`) o algún item pertenece a un `order_split` con `status='paid'`.
- **FR-08**: DEBE rechazar items cancelados, `SAME_ORDER`, `CROSS_TENANT`, `STALE_STATE` (el item ya no está en la orden origen esperada) y `DESTINATION_NO_OPEN_ORDER`.
- **FR-09**: **Permisos** — sólo admin/encargado (`canMoveItems`).
- **FR-10**: DEBE registrar **auditoría** (order_item_id, orden origen, orden destino, actor, motivo opcional).

**UI (US1)**
- **FR-11**: Desde la vista de cuenta/detalle de una mesa (mozo y admin/operación), admin/encargado DEBE poder seleccionar item(s) y elegir "Mover a otra mesa", con selector que lista **sólo mesas ocupadas** (con su etiqueta/estado).
- **FR-12**: Tras el traslado, ambas mesas DEBEN reflejar el cambio sin recarga manual (refresh forzado — ver plan.md).

### Key Entities
- **order_items** — la unidad que se mueve; cambia `order_id`. Arrastra `order_item_modifiers` y componentes de combo. Su vínculo `comanda_items` **no** se toca.
- **orders** — origen (−items) y destino (+items); ambas recalculadas. Ambas ya abiertas.
- **order_item_moves** (nueva) — auditoría del movimiento.

### Non-Goals (fuera de alcance)
- **Merge de mesa completa** a una ocupada (spec 048, descartado).
- **Mover a una mesa libre** (abrir cuenta nueva con algunos items) — usar `trasladarMesa` para mover todo; el resto se difiere.
- **Tocar cocina**: anular/re-imprimir/re-rutear comandas por el traslado.
- **Partir cantidad** de una línea (mover 2 de 3).
- **Items ya pagados** o cuentas con cobro parcial iniciado (se bloquea).
- **Traslado entre negocios**.
- **Que el mozo lo haga** sin encargado.

## Success Criteria *(mandatory)*

- **SC-01**: Un encargado mueve un producto de una mesa ocupada a otra en ≤ 3 taps, y ambos totales quedan correctos (verificable con `calculateTotals`).
- **SC-02**: 0 casos de item duplicado, perdido o cobrado dos veces tras un traslado (tests de integración).
- **SC-03**: Intentar mover un item de una cuenta con pago registrado siempre falla con mensaje claro (nunca corrompe el cobro).
- **SC-04**: El traslado no genera ninguna impresión ni cambio en el KDS (cocina intacta).
