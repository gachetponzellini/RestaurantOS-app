# Feature Specification: Trasladar una mesa completa a otra mesa (Fase 1 — destino libre)

**Feature Branch**: `048-trasladar-mesa`

**Created**: 2026-07-17

**Status**: Especificado (2026-07-17). Pendiente: `plan.md` aprobado → TDD. Issue [#72](https://github.com/gachetponzellini/RestaurantOS-app/issues/72). Milestone: Post-demo · Growth & hardening.

**Input**: Pedido de Juan 2026-07-17 — "hay que implementar la función de trasladar una mesa entera a otra mesa, con todo". Decisiones tomadas en la conversación: **Fase 1 = solo destino libre**; permiso **solo encargado/admin**; comandas **solo mover en el sistema** (sin reimpresión).

## Contexto y problema

En el salón pasa seguido que un grupo se cambia de mesa: se reubican por tamaño, por ubicación (sol/sombra, ruido), o porque se liberó una mejor. Hoy **no hay forma de trasladar la mesa en el sistema**: el mozo/encargado tiene que cobrar y volver a abrir en la mesa nueva, perdiendo la comanda, los tiempos y la continuidad de la cuenta.

Ojo con el falso amigo: ya existe `transferTable` (`src/lib/mozo/actions.ts:556-671`), pero **transfiere el mozo asignado** (CU-09, reasignación) — `UPDATE tables SET mozo_id`. **No mueve la orden ni el contenido.** Esta feature es otra cosa.

### La clave del modelo: todo cuelga de `order_id`, no de `table_id`

El vínculo mesa↔orden es bidireccional y mantenido por la app (sin triggers):

- `orders.table_id` → mesa (**fuente de verdad** del vínculo activo, junto con `lifecycle_status='open'`)
- `tables.current_order_id` → orden (puntero *best-effort*; ninguna lectura de la orden activa depende de él — todas consultan por `table_id + lifecycle_status='open'`)

`order_items`, `comandas`, `comanda_items`, `payments`, `order_splits`, `order_split_items`, `order_status_history`, `tip_cents`, `total_cents`, `bill_requested_at` — **todo cuelga de `order_id`**. Por eso mover una orden a otra mesa física = **repuntear `orders.table_id` A→B** + reconciliar los dos punteros de mesa. El contenido y la plata **viajan solos, sin reescribirse**.

### La regla dura que gobierna todo

El índice parcial `orders_one_open_per_table` ON `orders(table_id) WHERE lifecycle_status='open' AND table_id IS NOT NULL` (`supabase/migrations/0001_baseline.sql:2803`) hace **imposible** tener dos órdenes abiertas en la misma mesa. Consecuencias:

1. Trasladar a una mesa **libre** (sin orden open) = un `UPDATE` que la DB acepta.
2. Trasladar a una mesa **ocupada** (con orden open) = el `UPDATE` **falla con `23505`**. Esto convierte el caso "destino ocupada" en un problema de **fusión de dos cuentas**, que toca plata en serio → **queda fuera de Fase 1** (ver Fase 2 más abajo).

## Alcance

### Fase 1 (este spec) — SÍ incluye

- **Trasladar la orden abierta de mesa A → mesa B cuando B está LIBRE** ("mover simple").
- Traslado válido aunque la mesa **ya pidió la cuenta** (`bill_requested_at` seteado) — caso real y común; B queda en `pidio_cuenta`.
- Traslado válido aunque haya **cobros parciales** (`payments 'paid'`) o **splits activos** en A — el repunteo simple los preserva intactos (siguen por `order_id`).
- Traslado **cross-salón** (A y B en `floor_plan_id` distintos, mismo `business`).
- Destino **barra** (`is_bar=true`) permitido si está libre (mover un grupo a la barra mientras espera es real).
- La **reserva `seated`** pegada a la mesa origen se mueve con el grupo a B.

### Fase 1 — NO incluye (queda para Fase 2 / otro spec)

- **Destino OCUPADA → fusión/merge de dos órdenes** → **bloqueado** con error claro `DESTINATION_OCCUPIED` (mensaje: *"La mesa está ocupada. Cobrala o liberala antes de mover."*). El mensaje **no** debe leerse como "nunca se pueden unir mesas", sino "todavía no".
- **Reimpresión de comandas** con la etiqueta de la mesa nueva. Decisión explícita: **solo mover en el sistema**. El ticket de papel ya impreso queda con la mesa vieja; las pantallas digitales reflejan la mesa nueva. (Esto además evita el riesgo de doble-cocinado en cocina de papel.)
- Traslado entre `business` distintos (cross-tenant) → rechazado siempre.

## Decisiones de producto

| Decisión | Resolución | Motivo |
|---|---|---|
| **Permiso** | Solo **encargado / admin** | Espeja `canTransitionMesa` (liberar/anular mesa hoy exige encargado+). El mozo no traslada. |
| **Comandas** | **Solo mover en el sistema**, sin reimpresión | El papel ya impreso queda con la mesa vieja; se acepta. Evita doble-cocinado en comanderas físicas. |
| **`opened_at`** | Se **preserva** el de A (no `now()`) | No resetear el reloj "X min en mesa" ni falsear la duración en reports. |
| **Mozo** | La mesa B adopta el `tables.mozo_id` de A | El mozo sigue a su mesa. La atribución de propina ya está congelada en `payments.attributed_mozo_id`, no se toca. |
| **Destino ocupada** | Bloqueado (`DESTINATION_OCCUPIED`) | Fusión toca plata → Fase 2. |
| **Destino barra libre** | Permitido | Caso real. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Trasladar a una mesa libre (Priority: P1)

Como **encargado**, cuando un grupo se cambia de la mesa 5 a la mesa 12 (libre), toco "Trasladar" en la mesa 5, elijo la 12 y confirmo. La cuenta, los pedidos y los tiempos aparecen ahora en la mesa 12; la mesa 5 queda libre.

**Why this priority**: Es el pedido central del cliente y el caso más común. "El local manda": el software se adapta al movimiento real del salón.

**Independent Test**: Con una mesa A ocupada (orden open con items + comandas) y una mesa B libre, ejecutar el traslado → `orders.table_id` pasa a B; A queda `libre` con `current_order_id=NULL`; B queda `ocupada` con `current_order_id=<orden>`; los items/comandas/pagos no cambian de `order_id`.

**Acceptance Scenarios**:

1. **Dado** A ocupada con orden open y B libre, **Cuando** trasladó A→B, **Entonces** `orders.table_id=B`, A `operational_status='libre'` + `current_order_id=NULL` + `opened_at=NULL` + `mozo_id=NULL`, y B `operational_status='ocupada'` + `current_order_id=<orden>` + `opened_at=<el de A>` + `mozo_id=<el de A>`.
2. **Dado** el traslado, **Cuando** consulto la orden, **Entonces** `order_items`, `comandas` (mismo `order_id`), `payments`, `order_splits`, `total_cents`, `total_paid_cents`, `tip_cents` y `bill_requested_at` **no cambiaron**.
3. **Dado** el traslado, **Cuando** miro la cuenta y la demora de mesa en B, **Entonces** son las mismas que tenía A (la demora se recalcula sola por `comanda.emitted_at`).
4. **Dado** el traslado, **Cuando** reviso `tables_audit_log`, **Entonces** hay dos filas `kind='move'` (una por mesa) con `from_value`/`to_value` cruzados, `by_user_id` y `reason`.

---

### User Story 2 - La cuenta ya pedida viaja con el grupo (Priority: P2)

Como **encargado**, si la mesa 5 ya pidió la cuenta y el grupo se cambia a la 12, al trasladar la mesa 12 queda en estado "pidió cuenta".

**Independent Test**: A con `orders.bill_requested_at` seteado (estado `pidio_cuenta`), trasladar A→B libre → B queda `operational_status='pidio_cuenta'`; `bill_requested_at` intacto.

**Acceptance Scenarios**:

1. **Dado** A en `pidio_cuenta`, **Cuando** trasladó A→B, **Entonces** B queda `pidio_cuenta` y A `libre`.
2. **Dado** A con un cobro parcial ya tomado (`payments 'paid'`), **Cuando** trasladó A→B, **Entonces** el pago sigue atado a la orden (mismo `order_id`, mismo `caja_id`, mismo `attributed_mozo_id`) y la rendición del mozo no cambia.

---

### User Story 3 - Destino ocupado se bloquea con mensaje claro (Priority: P2)

Como **encargado**, si intento trasladar a una mesa que ya está ocupada, el sistema me lo impide con un mensaje que me dice qué hacer.

**Independent Test**: B con orden open → trasladar A→B devuelve error `DESTINATION_OCCUPIED`; ni A ni B cambian de estado.

**Acceptance Scenarios**:

1. **Dado** B ocupada, **Cuando** intento A→B, **Entonces** error "La mesa está ocupada. Cobrala o liberala antes de mover." y **cero** cambios de estado (rollback atómico).
2. **Dado** B libre pero con un `enviarComanda(B)` que aterriza justo antes de mi confirmación, **Cuando** se ejecuta el traslado, **Entonces** falla limpio con `DESTINATION_OCCUPIED` (no un `23505` crudo) y rollback total.

---

### User Story 4 - Solo encargado/admin puede trasladar (Priority: P1 — permiso)

**Independent Test**: llamar la server action con rol `mozo` → rechazo por permiso. Llamar el RPC `trasladar_mesa_tx` directo con cliente rol `authenticated` (no `service_role`) → rechazo por permiso de ejecución (`REVOKE`).

**Acceptance Scenarios**:

1. **Dado** un usuario `mozo`, **Cuando** intenta trasladar, **Entonces** error de permiso, cero cambios.
2. **Dado** cualquier cliente `authenticated`, **Cuando** invoca el RPC directo, **Entonces** falla (el RPC solo lo ejecuta `service_role`).
3. **Dado** mesas de otro `business`, **Cuando** se intenta trasladar (origen o destino), **Entonces** rechazo cross-tenant.

---

### Edge Cases

- **🔴 Cobro final concurrente con el traslado** (co-requisito crítico): un cobro que cierra la orden corre en `closeOrderIfFullyPaid` **fuera** del lock del RPC y con `table_id` viejo. Sin el fix, deja B ocupada apuntando a una orden cerrada = **mesa fantasma**. → El fix (liberar por `current_order_id`) es parte de este spec (ver `plan.md`). Test obligatorio: cobro final + move concurrentes → exactamente una mesa ocupada antes del cierre, cero mesas huérfanas después.
- **`enviarComanda(A)` con cliente stale** tras el move: un mozo cargando en la mesa origen que se acaba de vaciar puede crear una orden **nueva** en A → cuenta partida. Mitigación: refresh por realtime `mesa.moved` en el dispositivo origen. Documentado; test e2e.
- **Traslado a la misma mesa** (A===B): no-op / error `SAME_TABLE`.
- **Doble-tap del botón** "Mover" (misma orden, misma B): el segundo request ve la orden ya en B → no-op limpio, sin doble fila de audit (parámetro `p_expected_order_id`).
- **Pedido diferido/scheduled** (spec 31): tiene `table_id=NULL`, nunca matchea el path del move (que resuelve por `table_id + lifecycle='open'`). Guard/test explícito.
- **KDS abierto** con la orden: como no se reimprime, el kanban (que escucha realtime sobre `comandas`) no se refresca solo → debe suscribirse también a `orders`/`tables` para re-etiquetar la mesa (ver `plan.md`).
- **Destino con reserva `confirmed` futura**: el picker avisa ("libre, reservada 21:00") pero no bloquea; decisión del encargado.
- **`opened_at` NULL en A** al mover (estado inconsistente previo): B queda con `opened_at` NULL mientras `ocupada`; verificar que `reports-query.ts:718` (duración) tolere null.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir trasladar la orden abierta de una mesa A a una mesa B **libre** (sin orden `open`), del mismo `business`, reasignando `orders.table_id` A→B.
- **FR-002**: El sistema DEBE, en la misma operación atómica: liberar A (`operational_status='libre'`, `current_order_id=NULL`, `opened_at=NULL`, `mozo_id=NULL`) **sin cancelar la orden**, y ocupar B (`current_order_id=<orden>`, `operational_status='pidio_cuenta'` si la orden tiene `bill_requested_at` si no `'ocupada'`, `opened_at=<el de A>`, `mozo_id=<el de A>`).
- **FR-003**: El sistema NO DEBE tocar `order_items`, `comandas.order_id`, `comanda_items`, `payments`, `order_splits`, `order_split_items`, ni los totales/propina/`bill_requested_at` de la orden.
- **FR-004**: El sistema DEBE mover la reserva `seated` de A a B (scopeada por `business_id`).
- **FR-005**: El sistema DEBE registrar el traslado en `tables_audit_log` con `kind='move'` (dos filas, `from_value`/`to_value` cruzados, `by_user_id`, `reason`).
- **FR-006**: El sistema DEBE rechazar el traslado a una mesa **ocupada** con `DESTINATION_OCCUPIED`, incluso ante carrera (capturar `23505` del índice único), con rollback atómico.
- **FR-007**: El sistema DEBE restringir el traslado a rol **encargado/admin**; el RPC DEBE ser inejecutable por `anon`/`authenticated` (`REVOKE` + `GRANT` solo a `service_role`).
- **FR-008**: El sistema DEBE emitir una notificación interna `mesa.moved` (broadcast a encargado + puntual al mozo de la mesa), sin notificar al actor.
- **FR-009 (co-requisito)**: `closeOrderIfFullyPaid` DEBE liberar la mesa por `current_order_id = orderId` (no por `order.table_id` stale) para ser idempotente y move-agnóstico, evitando la mesa fantasma en la carrera cobro+move.
- **FR-010**: El sistema DEBE aceptar `p_expected_order_id` y, si la orden `open` de A no coincide, devolver `STALE_STATE` (protege doble-tap y traslados encadenados).

### Key Entities

- **orders**: `table_id` (se repunta), `lifecycle_status='open'`, `bill_requested_at`, `mozo_id`. Todo lo demás cuelga de acá.
- **tables**: A (origen) y B (destino) — `operational_status`, `current_order_id`, `opened_at`, `mozo_id`, `is_bar`, `floor_plan_id`.
- **tables_audit_log**: nueva `kind='move'` (requiere ampliar el CHECK).
- **reservations**: la `seated` de A se mueve a B.

## Success Criteria *(mandatory)*

- **SC-001**: Trasladar A→B (libre) deja la orden y toda su plata intactas y la cuenta continúa en B, en una sola operación atómica.
- **SC-002**: Ningún escenario (incluida la carrera cobro-final + move) deja una mesa `ocupada` apuntando a una orden cerrada/cancelada, ni una mesa `libre` con orden `open`.
- **SC-003**: El traslado a mesa ocupada nunca corrompe estado: falla con mensaje claro y rollback total.
- **SC-004**: Solo encargado/admin pueden trasladar; el RPC no es invocable por clientes autenticados.

## Fase 2 (fuera de este spec, backlog)

Fusión de dos mesas ocupadas (merge): reparentar `order_items`/`comandas` (renumerando `batch`), consolidar `payments`/`splits`/totales y cerrar la orden absorbida. Solo habilitable con guards de plata (ambas órdenes limpias, sin `payments`/`splits`), por las implicancias fiscales (dos `order_number`) y de caja. Spec aparte.
