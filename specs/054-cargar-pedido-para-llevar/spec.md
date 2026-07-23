# Feature Specification: Encargado — cargar pedido para llevar/delivery desde operación (+ cobrar/facturar)

**Feature Branch**: `054-cargar-pedido-para-llevar`

**Created**: 2026-07-23

**Status**: 🚧 Implementado — código verde (`pnpm typecheck` limpio + `pnpm vitest run` 780✓ + `pnpm build` OK). **Fase 1** (carga + marcha + cobro/factura) + **Fase 2** (2026-07-23: picker alineado con el sidebar keyboard-first de [spec 055](../055-carga-pedido-teclado/) + selector de **cliente existente**, ver Tasks T016–T019). **Pendiente verify en vivo con rol real** (encargado + caja + AFIP sandbox, T015) antes de dar por cerrado. Issue [#83](https://github.com/gachetponzellini/RestaurantOS-app/issues/83). Milestone: Post-demo · Growth & hardening. Extiende el board de pedidos online de [features/pagos.md](../../../wiki/features/pagos.md) y reusa el motor de cobro/facturación de [features/cobros.md](../../../wiki/features/cobros.md).

**Input**: Pedido de Juan 2026-07-23 — "que el encargado, desde la vista de operación en la parte de pedidos, pueda cargar pedidos". Decidido con Juan (misma fecha): (1) el pedido a cargar es **para llevar / delivery, sin mesa** (el pedido de mostrador o telefónico, que hoy solo entra automático por web/chatbot); (2) el alcance incluye un **botón «Cobrar/Facturar» en la card del board** (registrar pago + factura ARCA), como punto medio entre "solo cargar" y "cobro completo con splits".

## Contexto y problema

Hoy los pedidos **para llevar (pickup)** y **delivery** sólo pueden nacer por un canal: el cliente los arma en la carta pública (`createOrder` → `persistOrder`, [`orders/persist-order.ts:36`](../../src/lib/orders/persist-order.ts)). Cuando un cliente **llama por teléfono** o **pide en el mostrador**, el encargado **no tiene forma de cargar ese pedido a mano**: no hay ningún creador de pedido de carta sin mesa desde el panel. El único creador sin mesa que existe es `crearPedidoFlash` ([`billing/pedido-flash.ts:29`](../../src/lib/billing/pedido-flash.ts)), pero es un **renglón por monto libre** (concepto + total), sin selección de productos, con `delivery_type: "dine_in"` y con el fin de facturar un evento suelto — no arma `order_items` reales ni rutea a cocina.

En paralelo, el **cobro está atado a la mesa**: toda la ruta de cobro (`mozo/mesa/[id]/cobrar`) se keyea por `table_id` + splits. Aunque los actions de dinero son en realidad **order-scoped** (ver "Lo que ya existe"), **ninguna UI** permite cobrar ni facturar un pedido del board de pedidos online.

Resultado: el mostrador/teléfono queda fuera del sistema. El encargado no puede cargar un "2 hamburguesas para llevar", no marcha a cocina, y no puede cobrarlo/facturarlo desde la operación.

### Lo que ya existe y se reusa

- **Carga sin mesa (motor):** `persistOrder` ([`orders/persist-order.ts:36`](../../src/lib/orders/persist-order.ts)) ya crea una orden `delivery`/`pickup` **sin `table_id`**, con `order_items`, combos, modificadores, upsert del cliente y (si corresponde) MP. Acepta un `userId` opcional. **No** crea comandas al nacer (auto-march removido por spec 047).
- **Contrato de input:** `CreateOrderInput` ([`orders/schema.ts:35`](../../src/lib/orders/schema.ts)) — `delivery_type` (`delivery|pickup`), `customer_name`, `customer_phone`, `items[]`, `delivery_address` (obligatoria si `delivery`), etc.
- **El board muestra el pedido solo, en realtime:** `getTodayOrders` ([`admin/orders-query.ts:49`](../../src/lib/admin/orders-query.ts), filtra `.neq("delivery_type","dine_in")`) + `OrdersRealtimeBoard` ([`components/admin/orders-realtime-board.tsx:107`](../../src/components/admin/orders-realtime-board.tsx)): un `INSERT` de una orden pickup/delivery aparece automáticamente en la columna "Nuevos".
- **Marcha a cocina:** `confirmarPedido` ([`orders/confirm-order.ts:25`](../../src/lib/orders/confirm-order.ts), gate `canConfirmOrder` = admin/encargado) → `routeOrderToCocina` ([`orders/route-to-cocina.ts:23`](../../src/lib/orders/route-to-cocina.ts)): resuelve el sector por ítem, crea las comandas (`createComandasForItems`, dispara impresión) y avanza la orden a `preparing`. Es idempotente.
- **Cobro sin mesa (motor):** `registrarPago` ([`billing/cobro-actions.ts:347`](../../src/lib/billing/cobro-actions.ts)) acepta `splitId: null` (paga la orden entera; la RPC `registrar_pago_tx` trata "sin split" como camino de primera clase); `closeOrderIfFullyPaid` ([`billing/cobro-actions.ts:137`](../../src/lib/billing/cobro-actions.ts)) cierra la orden (`lifecycle_status = 'closed'`) y **saltea la liberación de mesa** cuando la orden no tiene mesa. `iniciarCobro(orderId, slug)` devuelve las cajas + `methodConfigs` del negocio.
- **Facturación sin mesa (motor):** `emitInvoice(orderId, …)` ([`afip/emit-invoice.ts:139`](../../src/lib/afip/emit-invoice.ts)) es 100% order-scoped, **sin gate de "pagado/cerrado"**, factura sobre `total_cents − tip_cents`, resuelve el tipo por `businesses.afip_default_tipo` (default Factura B) y ya maneja la **condición IVA del receptor** (spec 053). Es lo que usa el pedido flash para facturar sin mesa.
- **Picker de carta del staff:** `MozoPedirClient` ([`mozo/mesa/[id]/pedir/pedir-client.tsx:224`](../../src/app/[business_slug]/mozo/mesa/[id]/pedir/pedir-client.tsx)) — grid por supercategoría + buscador + carrito, con props `embedded`/`onClose`/`onSent` pensados para reusarse fuera de la app del mozo. Hoy está **atado a una `table`** y envía con `enviarComanda(tableId)`.
- **Permisos:** `can.ts` ([`permissions/can.ts`](../../src/lib/permissions/can.ts)) — `canConfirmOrder` (admin/encargado) ya existe. `crearPedidoFlash` da el patrón "crear orden sin mesa desde admin con gate `requireMozoActionContext` + `canCrearPedidoFlash`".

### Lo que falta (objeto de esta spec)

1. Un **punto de entrada en la tab «Pedidos»** para cargar un pedido a mano (hoy esa tab sólo hace triage de pedidos entrantes).
2. Un **picker de carta admin-side sin mesa** + captura de datos de entrega (pickup/delivery), que arme el pedido y lo persista con `persistOrder`.
3. Un **server action** que autentique con el gate del staff (patrón flash) y registre **quién cargó** el pedido.
4. Un **botón «Cobrar/Facturar»** en la card/sheet del pedido que encadene `registrarPago(splitId:null)` → `emitInvoice`, hoy nunca invocados juntos fuera de la ruta de mesa.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Cargar un pedido para llevar/delivery sin mesa (Priority: P1)

Como **encargado**, desde la tab **«Pedidos»** de operación toco **«Cargar pedido»**, elijo si es **para llevar** o **delivery**, armo el pedido eligiendo productos de la carta (mismo picker que uso para una mesa), completo los datos mínimos del cliente (nombre; teléfono/dirección si es delivery) y **confirmo**. El pedido queda creado, sin mesa, y **aparece solo en el board** en la columna "Nuevos".

**Why this priority**: Es el pedido central. Hoy el mostrador/teléfono está fuera del sistema; sin esto no hay feature.

**Independent Test**: Llamar `cargarPedidoStaff(slug, { delivery_type, customer_name, items, … })` con rol encargado → se crea una `orders` con `table_id = null`, `delivery_type` pickup/delivery, `mozo_id = <encargado>` (auditoría de quién cargó), sus `order_items`, y aparece en `getTodayOrders`. Sin comandas todavía.

**Acceptance Scenarios**:

1. **Dado** el encargado en la tab «Pedidos», **Cuando** toca «Cargar pedido», elige **para llevar**, agrega 2 productos y confirma con nombre "Juan", **Entonces** se crea una orden `pickup` sin mesa, con 2 `order_items` y `customer_name = "Juan"`, y aparece en el board en "Nuevos".
2. **Dado** un pedido **delivery**, **Cuando** el encargado no completa la dirección, **Entonces** se rechaza pidiendo la dirección (delivery exige `delivery_address`).
3. **Dado** un pedido **para llevar** de mostrador sin teléfono, **Cuando** el encargado confirma sólo con nombre, **Entonces** se acepta (el teléfono es opcional en pickup; se guarda `"-"` si falta, y el nombre cae en "Mostrador" si tampoco se carga).
4. **Dado** el pedido cargado, **Cuando** se inspecciona la orden, **Entonces** `mozo_id` = el usuario encargado que la cargó (queda registrado quién la cargó) y `delivery_type ≠ dine_in` (la orden pertenece al board, no al salón).
5. **Dado** un **mozo** o **personal**, **Cuando** intenta `cargarPedidoStaff`, **Entonces** se rechaza (gate `canCargarPedido` = admin/encargado en fase 1).
6. **Dado** un producto de **otro negocio** en el payload, **Cuando** se intenta cargar con el slug propio, **Entonces** se rechaza (scope `business_id`, igual que `persistOrder`/`enviarComanda`).
7. **Dado** un carrito **vacío**, **Cuando** el encargado confirma, **Entonces** se rechaza ("agregá al menos un producto").

---

### User Story 2 — Marchar el pedido cargado a cocina (Priority: P1)

Como **encargado**, sobre el pedido que cargué (que está en "Nuevos"), toco **«Confirmar»** y el pedido **marcha a cocina**: se crean las comandas por sector y salen en las comanderas, y el pedido pasa a "Preparando". Como atajo, al cargar puedo elegir **«Cargar y enviar a cocina»** para hacerlo en un solo paso.

**Why this priority**: Un pedido que no llega a la cocina no sirve. Reusa el «Confirmar» que ya existe en el board (spec 05/047), sin inventar auto-march.

**Independent Test**: Sobre una orden cargada por staff en estado `pending`, `confirmarPedido(orderId, slug)` con rol encargado → `routeOrderToCocina` crea las comandas por sector (con `station_id` + impresión) y la orden queda `preparing`.

**Acceptance Scenarios**:

1. **Dado** un pedido cargado con ítems de 2 sectores (cocina + parrilla), **Cuando** el encargado toca «Confirmar», **Entonces** se crean 2 comandas (una por sector), se disparan a imprimir y la orden pasa a `preparing`.
2. **Dado** el atajo «Cargar y enviar a cocina», **Cuando** el encargado confirma la carga, **Entonces** el pedido se crea **y** se marcha a cocina en el mismo gesto (equivale a `cargarPedidoStaff` + `confirmarPedido`).
3. **Dado** un pedido ya marchado, **Cuando** se vuelve a confirmar/marchar, **Entonces** es idempotente (no duplica comandas — `routeOrderToCocina` saltea si ya hay comandas).

---

### User Story 3 — Cobrar y facturar el pedido desde la card (Priority: P1)

Como **encargado**, cuando el cliente paga el pedido para llevar, toco **«Cobrar/Facturar»** en la card (o en el detalle) del pedido en el board, elijo el **método** (efectivo / tarjeta) y la **caja**, y confirmo: se **registra el pago** por el total, el pedido queda **cerrado (pagado)**, y se **emite la factura ARCA** (Factura B consumidor final por defecto; con opción de Factura A cargando CUIT + condición IVA del receptor).

**Why this priority**: Cierra el ciclo de plata del mostrador. Sin esto el pedido queda cargado pero nunca se puede cobrar ni facturar desde la operación.

**Independent Test**: Sobre una orden pickup sin mesa con `total_cents > 0`, `registrarPago({ orderId, splitId: null, method, amount_cents: total, caja_id, slug })` → se inserta el `payment` (sin `split_id`), `closeOrderIfFullyPaid` marca `lifecycle_status = 'closed'`; luego `emitInvoice({ orderId, slug })` emite la factura sobre `total − tip`.

**Acceptance Scenarios**:

1. **Dado** un pedido para llevar de $2.000, **Cuando** el encargado cobra en efectivo por el total contra una caja abierta, **Entonces** se registra un `payment` (`method="cash"`, `split_id=null`, `caja_id`) y la orden queda `lifecycle_status='closed'`.
2. **Dado** ese pago completo, **Cuando** termina el cobro, **Entonces** se emite la factura ARCA sobre `total_cents − tip_cents` (propina = 0 en mostrador) con el tipo por defecto del negocio (Factura B), y la factura queda asociada a la orden.
3. **Dado** que el cliente pide **Factura A**, **Cuando** el encargado elige tipo A y carga CUIT + razón social + condición IVA, **Entonces** `emitInvoice` valida la coherencia (tipo A ⇒ condición ∈ {1,6}, exige CUIT) y emite A (reusa la lógica de spec 053).
4. **Dado** un pedido **ya facturado**, **Cuando** se intenta facturar de nuevo, **Entonces** se rechaza por la idempotencia fiscal existente (una factura `authorized` por tipo por orden).
5. **Dado** que **no hay caja abierta**, **Cuando** el encargado intenta cobrar, **Entonces** se avisa que debe abrir/seleccionar una caja (no se registra el pago).
6. **Dado** un **mozo**, **Cuando** intenta cobrar/facturar desde el board, **Entonces** se rechaza (mismo gate que el cobro/facturación de mesa).
7. **Dado** dos cobros concurrentes sobre el mismo pedido, **Cuando** ambos intentan pagar el total, **Entonces** el segundo es no-op idempotente (RPC `registrar_pago_tx` + `request_id`); no se duplica el pago ni la factura.

### Edge Cases

- **Propina en mostrador**: un pedido para llevar **no lleva propina** → `tip_cents = 0`; la base facturable es el total completo. (La propina fuera del facturable ya está resuelta a nivel motor.)
- **Delivery sin dirección / pickup sin teléfono**: delivery **exige** `delivery_address`; pickup acepta sin teléfono (guarda `"-"`). El nombre por defecto es "Mostrador" si el encargado no carga ninguno.
- **Cargar y NO marchar**: si el encargado sólo carga (no toca Confirmar), el pedido queda en "Nuevos" sin comandas — igual que cualquier pedido online sin confirmar. Es válido (ej: cargar ahora, marchar cuando el cliente confirme).
- **Cobrar antes o después de marchar**: el cobro (US3) es **independiente** de la marcha (US2). Se puede cobrar y luego marchar, o marchar y cobrar al retirar. Pagar **no** marcha a cocina por sí solo (respeta spec 047: la marcha es explícita vía «Confirmar»).
- **MP link/QR en mostrador**: fuera de fase 1 (ver Non-Goals). El cobro de mostrador es efectivo o tarjeta manual.
- **Menú del día / combos**: se cargan como cualquier ítem (el picker ya los soporta); el precio vive en el ítem padre (sin cambios).
- **Pedido diferido ("para las 21h")**: fuera de fase 1 (`scheduled_at` por staff no se ofrece; el diferido del cliente es la spec 31).
- **Scope multi-tenant**: todo scopeado por `business_id` (productos, orden, pago, factura), igual que los flujos existentes.

## Requirements *(mandatory)*

### Functional Requirements

**Cargar pedido sin mesa (US1)**

- **FR-001**: `cargarPedidoStaff(slug, input)` MUST resolver el negocio por slug, exigir sesión y gate `canCargarPedido(role)` (admin/encargado en fase 1); scope por `business_id`.
- **FR-002**: El input MUST validarse con un schema staff-side derivado de `CreateOrderInput`: `delivery_type ∈ {pickup, delivery}`, `items` (mín 1), `customer_name` **opcional** (default "Mostrador"), `customer_phone` **opcional en pickup** (default `"-"`) y **requerido en delivery**, `delivery_address` **requerida si delivery**, `delivery_notes` opcional. NO acepta `scheduled_at` en fase 1.
- **FR-003**: MUST crear la orden vía `persistOrder`, pasando el `userId` del encargado, y MUST persistir **quién cargó** el pedido en `orders.mozo_id` (sin migración: la columna ya existe). La orden nace `table_id = null`, `delivery_type` pickup/delivery, `payment_status = "pending"`, sin comandas.
- **FR-004**: `persistOrder` MUST extenderse (retrocompatible) para aceptar un `mozo_id`/`createdByUserId` opcional y setearlo en el insert; los callers actuales (checkout público) siguen pasando `null` → comportamiento idéntico.
- **FR-005**: MUST validar los productos/modificadores contra el negocio (activos/disponibles, min/max de grupos), reusando las validaciones de `persistOrder`; MUST rechazar carrito vacío.

**Marchar a cocina (US2)**

- **FR-006**: El pedido cargado MUST poder marcharse con el `confirmarPedido` existente (gate `canConfirmOrder`), que crea las comandas por sector (`routeOrderToCocina`) y avanza la orden a `preparing`. No se agrega auto-march (respeta spec 047).
- **FR-007**: MUST ofrecerse un atajo **«Cargar y enviar a cocina»** que componga `cargarPedidoStaff` + `confirmarPedido` en un gesto; ambos con loading explícito (frontera de plata/estados, spec 21).

**Cobrar y facturar (US3)**

- **FR-008**: La card/sheet del pedido en el board MUST ofrecer **«Cobrar/Facturar»** para pedidos no cerrados; el flujo registra el pago por el **total** vía `registrarPago({ splitId: null, method, amount_cents, caja_id })` (un solo pago, sin splits), con `tip_cents = 0`.
- **FR-009**: El cobro MUST resolver la **caja** (reusa `iniciarCobro`/`getPaymentMethodConfigs` para traer cajas + métodos habilitados del negocio) y MUST rechazar si no hay caja disponible. Métodos de fase 1: `cash` y `card_manual`.
- **FR-010**: Al quedar `fully_paid`, MUST cerrarse la orden vía `closeOrderIfFullyPaid` (`lifecycle_status='closed'`); sin mesa, se saltea la liberación de mesa (ya soportado).
- **FR-011**: Tras el pago, MUST poder emitirse la factura con `emitInvoice({ orderId, slug, … })`: por defecto el tipo del negocio (Factura B, consumidor final); con opción de **Factura A** cargando CUIT + razón social + condición IVA del receptor (reusa la validación de spec 053). La emisión es **order-scoped** y no requiere mesa.
- **FR-012**: El cobro y la facturación MUST usar los mismos gates que el cobro/facturación de mesa (`registrarPago`/`emitInvoice` — admin/encargado vía `requireMozoActionContext`); mozo/personal quedan fuera en fase 1. Ambas acciones con **loading explícito, no optimista** (frontera de plata, spec 21).
- **FR-013**: La emisión MUST respetar la idempotencia fiscal existente (una factura `authorized` por tipo por orden) y el cobro la idempotencia de `registrar_pago_tx` (`request_id`).

**UI (US1, US2, US3)**

- **FR-014**: La tab «Pedidos» (`OrdersRealtimeBoard`) MUST exponer un botón **«Cargar pedido»** que abra el picker de carta sin mesa (reusando el picker del staff) + el paso de datos de entrega (pickup/delivery, nombre, teléfono, dirección, notas).
- **FR-015**: La card/sheet del pedido MUST exponer **«Cobrar/Facturar»** (sheet de cobro mínimo: método + caja + opción de comprobante A/B), sin depender de la ruta de cobro de mesa (que está acoplada a `table_id`/splits).

### Key Entities

- **`orders`**: se reusan `table_id` (queda `null`), `delivery_type` (`pickup|delivery`), `mozo_id` (pasa a significar **"cargado por" el staff** en pedidos del board), `customer_name/phone`, `payment_status`, `lifecycle_status` (`open→closed` al cobrar). **Sin columnas nuevas** (sin migración).
- **`order_items`**: creados por `persistOrder` (snapshots de precio/nombre, combos, modificadores) — sin cambios.
- **`comandas`**: creadas al marchar (`routeOrderToCocina`) — sin cambios.
- **`payments`**: nuevo registro con `split_id = null`, `caja_id`, `method`, `amount_cents`, `tip_cents = 0` — sin cambios de schema.
- **`invoices`**: emitida por `emitInvoice` (order-scoped, `condicion_iva_receptor` de spec 053) — sin cambios.

### Non-Goals (fuera de alcance)

- **Cobro completo estilo mesa**: splits/dividir la cuenta, propina, vuelto, MP link/QR. Fase 1 = un pago por el total, efectivo o tarjeta manual. (El cobro completo desacoplado de mesa es un cambio mayor aparte.)
- **Mozo/personal como actores**: fase 1 sólo admin/encargado (cargar y cobrar). Sumar al mozo es un ajuste de `can.ts` posterior.
- **Pedido diferido por staff** (`scheduled_at`): el diferido del cliente ya es la spec 31; cargarlo desde staff queda para después.
- **Delivery operativo** (asignar repartidor, tracking, zonas): fuera; sólo se captura la dirección para el comprobante/entrega.
- **Columna `source`/canal explícito** en `orders`: el canal se infiere (`dine_in` = salón; resto = board; `mozo_id` no-null en un pedido del board = cargado por staff). Un flag `source` sería un fast-follow con migración.
- **Extraer/compartir el `CobrarSplitSheet` de mesa**: fase 1 usa un sheet mínimo propio; unificar la UI de cobro es refactor aparte.

## Success Criteria *(mandatory)*

- **SC-001**: El encargado carga desde la tab «Pedidos» un pedido para llevar (y uno delivery) eligiendo productos de la carta; el pedido aparece solo en el board, sin mesa, con registro de quién lo cargó.
- **SC-002**: El pedido cargado marcha a cocina con «Confirmar» (comandas por sector + impresión) y pasa a "Preparando"; el atajo «Cargar y enviar a cocina» lo hace en un paso.
- **SC-003**: El encargado cobra el pedido (efectivo/tarjeta) contra una caja y la orden queda cerrada; se emite la factura ARCA (B por defecto; A con CUIT + condición IVA).
- **SC-004**: Mozo/personal no pueden cargar ni cobrar (gates). Todo scopeado por `business_id`. Propina = 0 y base facturable = total.
- **SC-005**: `pnpm typecheck` + `pnpm test` en verde, con tests que blindan FR-001..FR-005 (carga + schema + scope + gate), FR-008/FR-010 (pago sin split cierra la orden) y FR-011/FR-013 (factura order-scoped + idempotencia). Verify en vivo con **rol real** (encargado): cargar → marchar (ticket de comanda) → cobrar → factura ARCA.
