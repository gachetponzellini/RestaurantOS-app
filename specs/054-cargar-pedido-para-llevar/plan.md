# Implementation Plan: 054 — Cargar pedido para llevar/delivery (encargado) + cobrar/facturar

## Enfoque

**Casi todo el motor existe; falta cablear.** La carga sin mesa la hace `persistOrder` tal cual; el board muestra la orden solo (realtime); la marcha reusa `confirmarPedido`/`routeOrderToCocina`; el cobro sin mesa lo soportan `registrarPago({splitId:null})` + `closeOrderIfFullyPaid` (que ya saltea la mesa); la factura la emite `emitInvoice` order-scoped (sin gate de pagado/cerrado). Lo nuevo es: (1) un **action de carga staff-side** que autentique con el patrón flash y llame `persistOrder`, (2) un **picker admin sin mesa** + captura de datos de entrega, y (3) un **sheet de cobro mínimo** en la card del board que encadene pago→factura (piezas que hoy nunca se llaman juntas fuera de la ruta de mesa).

**No se toca la máquina de estados** (`pending → preparing → …` sigue disparándose por `confirmarPedido`) ni el motor de cobro/factura. **Sin migración** (la orden sin mesa ya es posible — lo demuestra el pedido flash; `orders.mozo_id` ya existe para registrar quién cargó).

## Decisiones de diseño (design gate: toca dinero + estados)

### D1 — De dónde nace el pedido: `persistOrder`, no `enviarComanda`
`enviarComanda` es dine_in + mesa (appendea comandas a la orden abierta de una mesa). Para un pedido del board (pickup/delivery sin mesa) el creador correcto es **`persistOrder`** (ya arma `CreateOrderInput`, `table_id` null, items/combos/modifiers, upsert cliente). El nuevo action `cargarPedidoStaff` es un wrapper staff-side (patrón `crearPedidoFlash`): `requireMozoActionContext` + `canCargarPedido`, luego `persistOrder(input, userId)`.

### D2 — Auditoría de "cargado por": `orders.mozo_id`, sin migración
No existe `created_by` ni `source` en `orders`. Se reusa **`mozo_id`** para registrar el encargado que cargó el pedido (el board no filtra por `mozo_id`, sólo excluye `dine_in`, así que no rompe el listado). Requiere extender `persistOrder` para aceptar un `mozo_id` opcional (hoy no lo setea). **Riesgo bajo**: alguna lectura podría asumir "pickup ⇒ mozo_id null"; se audita en la implementación (grep de usos de `mozo_id` en queries de board). Un flag `source` explícito queda como fast-follow con migración (Non-Goal).

### D3 — Picker: reusar `MozoPedirClient` en modo sin-mesa
El staff ya conoce `MozoPedirClient` (mismo grid/carrito que cargar a una mesa) y tiene `embedded`/`onClose`/`onSent`. Se lo hace **`table`-opcional** con un `mode: "takeaway"`: mismo picker de productos, pero al confirmar (en vez de `enviarComanda(tableId)`) muestra un **paso de datos de entrega** (pickup/delivery, nombre, teléfono, dirección, notas) y llama `cargarPedidoStaff`.
- **Alternativa descartada (fase 1):** reusar el checkout público (`menu-client` + cart store Zustand). Ya arma un `CreateOrderInput` sin mesa, pero es UX de cliente (mobile) y su wrapper `createOrder` exige **sesión de cliente + rate-limit por IP** — no encaja en el panel.
- **Riesgo:** tocar `MozoPedirClient` (archivo grande). Mitigación: el modo takeaway es aditivo (guardas `if (mode === "takeaway")`); el camino de mesa queda intacto y cubierto por sus tests actuales. Si el acoplamiento resultara alto, el fallback es extraer sólo el grid+carrito a un componente compartido (más caro; se evalúa en T00x).

### D4 — Cobro: sheet mínimo propio, actions reusados tal cual
La UI de cobro de mesa (`CobrarSplitSheet`/`FacturacionSection`) está **inline en `cobrar-client.tsx`**, acoplada a `CuentaState`/`tableId`/splits — no reusable directo. Fase 1 construye un **`CobrarPedidoSheet`** delgado: selector de método (de `methodConfigs`) + caja + toggle A/B (+ CUIT/condición IVA si A). Los **actions de dinero se reusan sin tocar**: `registrarPago({splitId:null})` → (auto `closeOrderIfFullyPaid`) → `emitInvoice`. Un solo pago por el total, `tip_cents=0`. Extraer/unificar la UI de cobro es refactor aparte (Non-Goal).

### D5 — Marcha explícita, no auto-march
Respeta spec 047: el pedido cargado nace en "Nuevos" y marcha con el **«Confirmar» existente**. El atajo «Cargar y enviar a cocina» compone `cargarPedidoStaff` + `confirmarPedido` en el cliente (dos server actions con loading explícito), sin introducir auto-march en `persistOrder`.

### D6 — Schema staff más laxo que el público
Nuevo `StaffOrderInput` (Zod) derivado de `CreateOrderInput`: `customer_name` opcional (default "Mostrador"), `customer_phone` opcional en pickup (default `"-"`) y requerido en delivery, `delivery_address` requerida si delivery, sin `scheduled_at`. El público (`CreateOrderInput`) no se toca.

## Capas

### Datos
- **Sin migración.** Se reusan columnas existentes (`orders.mozo_id`, `payments.split_id` nullable, `invoices.condicion_iva_receptor`).

### Server (dominio)
- `StaffOrderInput` (Zod) — nuevo schema en `orders/schema.ts` (o co-ubicado).
- `cargarPedidoStaff(slug, input)` — nuevo action (¿`orders/staff-order.ts`?): gate `requireMozoActionContext` + `canCargarPedido`, valida `StaffOrderInput`, aplica defaults (nombre/teléfono), llama `persistOrder(mapped, userId, { mozoId: userId })`.
- `persistOrder` — extender firma para aceptar `mozo_id`/`createdByUserId` opcional y setearlo en el insert (retrocompatible; callers actuales pasan null).
- `canCargarPedido(role)` — nuevo helper en `can.ts` (admin/encargado).
- **Cobro/factura**: reusar `registrarPago`, `closeOrderIfFullyPaid`, `iniciarCobro`/`getPaymentMethodConfigs`, `emitInvoice` **sin cambios**. (Opcional: un thin action `cobrarPedidoRapido(slug, {orderId, method, caja_id, tipo?, receptor?})` que encadene pago→factura server-side para testear la secuencia de una; evaluar vs orquestar en el cliente como hace mesa.)

### Cliente
- `OrdersRealtimeBoard` — botón **«Cargar pedido»** (abre el picker) + en la card/sheet el botón **«Cobrar/Facturar»** (abre `CobrarPedidoSheet`).
- `MozoPedirClient` — `table` opcional + `mode: "takeaway"`; paso de datos de entrega; submit a `cargarPedidoStaff` (y atajo `+ confirmarPedido`).
- `CobrarPedidoSheet` — nuevo, mínimo: método + caja + comprobante A/B. Loading explícito.

## Orden (TDD)
1. `canCargarPedido` + test de gate.
2. `StaffOrderInput` + `cargarPedidoStaff` + test (scope, gate, defaults nombre/teléfono, delivery exige dirección, carrito vacío, `mozo_id` seteado). Extender `persistOrder` (`mozo_id`) + test de retrocompat.
3. Cobro sin mesa: test de integración `registrarPago(splitId:null)` → `closeOrderIfFullyPaid` cierra orden sin mesa → `emitInvoice` factura sobre `total−tip`. (Si se agrega `cobrarPedidoRapido`, test de la secuencia + idempotencia.)
4. UI: `MozoPedirClient` modo takeaway + paso de datos; botón «Cargar pedido» en el board.
5. UI: `CobrarPedidoSheet` + botón «Cobrar/Facturar» en la card/sheet.
6. `pnpm typecheck` + `pnpm test` verdes.
7. Verify en vivo con **rol real** (encargado): cargar para-llevar y delivery → marchar (comanda impresa) → cobrar (caja) → factura ARCA (B y A). Actualizar `wiki/features/pagos.md` + `wiki/features/cobros.md` + `wiki/specs/README.md` + log. Comentar + cerrar issue #83.

## Riesgos
- **`persistOrder` con `mozo_id` en pedido del board**: verificar que ninguna query de board/analítica asuma `mozo_id null` para pickup/delivery (grep antes de setearlo). Mitigable; si molesta, se aísla tras el flag `source` (fast-follow).
- **Tocar `MozoPedirClient`** (archivo grande, y hay WIP de otra sesión en catálogo — no en este archivo): el modo takeaway debe ser aditivo y no alterar el camino de mesa. Fallback: extraer el grid.
- **Caja requerida para cobrar**: si el encargado no tiene caja abierta, el cobro falla con aviso claro (no romper). Coherente con el cobro de mesa.
- **Factura sobre orden abierta**: `emitInvoice` no exige orden pagada; el orden correcto es pago→factura, pero si se factura sin cobrar (como el flash) igual funciona. La UI encadena pago→factura para no dejar impagos.
- **Doble cobro/doble factura**: cubierto por `request_id` (RPC) e idempotencia fiscal; se testea.
- **WIP en el árbol (catálogo, otra sesión)**: al commitear, stagear **sólo** los archivos de 054 (`git add specs/054-… src/… puntuales`), nunca `git add -A`.
