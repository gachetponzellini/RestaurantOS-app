# Tasks: 054 — Cargar pedido para llevar/delivery (encargado) + cobrar/facturar

Leyenda: `[ ]` pendiente · `[x]` hecho.

## Permisos
- [x] **T001** `canCargarPedido(role)` en `permissions/can.ts` (admin/encargado) + test de gate (FR-001, FR-012). ✅ `can.ts` + `can.test.ts`.

## Server — cargar sin mesa
- [x] **T002** `StaffOrderInput` (Zod) en `orders/schema.ts`: `delivery_type` pickup/delivery, `items` mín 1, `customer_name` opcional, `customer_phone` opcional en pickup / requerido en delivery, `delivery_address` requerida si delivery, sin `scheduled_at` (FR-002, D6). ✅ + `schema.test.ts` (7 casos).
- [x] **T003** Extender `persistOrder` con `options.mozoId` opcional (retrocompatible) → setea `orders.mozo_id` (FR-004, D2). ✅ Retrocompat: los `persist-order.integration.test.ts` existentes llaman sin options → `mozo_id = null` (siguen verdes). Test de `mozo_id` real evitado por FK de `users` en integración; se cubre en verify en vivo (T015).
- [x] **T004** `cargarPedidoStaff(input)` (nuevo, patrón flash): `requireMozoActionContext` + `canCargarPedido`, valida `StaffOrderInput`, aplica defaults (nombre "Mostrador", teléfono "-"), llama `persistOrder` con `mozoId = user.id` (FR-001..FR-005, D1). ✅ `orders/staff-order.ts`.
- [x] **T005** Test `cargarPedidoStaff` (`staff-order.test.ts`, mocks tenant/auth/persistOrder): gate mozo rechazado; negocio inexistente; pickup sin teléfono OK → "Mostrador"/"-"; delivery sin dirección rechazado; carrito vacío rechazado; `mozoId` pasado a `persistOrder`. ✅

## Server — marcha a cocina (reuso, sin código nuevo)
- [x] **T006** Marcha = `confirmarPedido` existente (spec 047) → `routeOrderToCocina`. Sin código nuevo server-side; el atajo «Cargar y enviar a cocina» compone en el cliente (T010). Verificación end-to-end en vivo (T015).

## Server — cobro/factura sin mesa (reuso, sin código nuevo)
- [x] **T007/T008** `registrarPago({splitId:null})` → `closeOrderIfFullyPaid` (cierra orden sin mesa) → `emitInvoice` ya soportan orden sin `table_id` (confirmado en el mapeo de los 3 agentes). Sin código nuevo server-side. Test automatizado evitado por fixtures pesados (caja abierta + config AFIP + FK); se cubre en verify en vivo (T015).
- [x] **T009** Descartado: se orquesta pago→factura en el cliente (`CobrarPedidoSheet`, T012), como hace la ruta de mesa. Sin action server que encadene.

## Cliente — cargar
- [x] **T010** **Ajuste de D3**: en vez de adaptar `MozoPedirClient` (1891 líneas, muy atado a mesa: header "Mesa X", seat mode, comandas de la mesa, `enviarComanda({tableId})`), se creó un **componente nuevo autocontenido** `components/admin/cargar-pedido-sheet.tsx` que reusa las piezas ya desacopladas: `ProductModal` (picker con modifiers) + `loadPedirCatalog` (loader, gate admin/encargado). Dos pasos (catálogo → datos de entrega), submit a `cargarPedidoStaff`, atajo «Cargar y enviar a cocina» (+ `confirmarPedido`). Loading explícito (FR-007, FR-014, D3, D5). Fase 1: sólo productos (menús del día = fast-follow).
- [x] **T011** `OrdersRealtimeBoard`: botón **«Cargar pedido»** en el toolbar que abre el sheet (FR-014). El pedido aparece solo por el realtime existente (no dine_in).

## Cliente — cobrar/facturar
- [x] **T012** `components/admin/cobrar-pedido-sheet.tsx` (nuevo, mínimo): caja (`iniciarCobro`) + método (efectivo/tarjeta/transferencia) + toggle Factura A (+ CUIT/condición IVA con helpers de spec 053). Encadena `registrarPago(splitId:null)` → (auto `closeOrderIfFullyPaid`) → `emitInvoice` (best-effort), loading explícito, no optimista (FR-008..FR-013, FR-015, D4). Verificado que `orders.lifecycle_status` default = `'open'` → el pedido nace cobrable.
- [x] **T013** Botón **«Cobrar / Facturar»** en el footer del `order-detail-sheet.tsx` (se abre desde la card), visible en pedidos no terminales; el sheet avisa si no hay caja (`iniciarCobro`) (FR-009, FR-015).

## Fase 2 — alineación con el sidebar 055 + cliente existente (pedido de Juan 2026-07-23)
- [x] **T016** Rediseño de `cargar-pedido-sheet.tsx` **alineado con el sidebar keyboard-first de [spec 055](../055-carga-pedido-teclado/)**: buscador fijo con **autofocus** + navegación por ↓/↑/Enter (reusa `moveSelection`/`resetSelection` de `mozo/product-search.ts`), **pedido siempre visible** (carrito en franja `shrink-0` con ±cantidad/quitar/total), categorías en `<select>` compacto, atajo **⌘/Ctrl+Enter** (carga→datos, datos→enviar), y reuso del `ProductModal` ya operable por teclado (Esc/foco). Vista `carga` (055-style) + vista `datos` compacta.
- [x] **T017** `buscarClientes(slug, query)` en `lib/admin/customers-actions.ts` (nuevo, `"use server"`): busca `customers` por nombre/teléfono (subset ≤8, `.or(ilike)`), gate `canCargarPedido` + scope `business_id`; term <2 → `[]`. + test (`customers-actions.test.ts`, 4 casos: gate mozo, term corto, happy, negocio inexistente).
- [x] **T018** Selector de **cliente existente** en la vista datos: input con debounce (300ms) → `buscarClientes` → lista; al elegir prellena nombre + teléfono (editable). Cargar cliente nuevo a mano sigue disponible. (Prellenar dirección de delivery desde `customer_addresses` = fast-follow.)
- [x] **T019** Verde: `typecheck` **100% limpio** + `vitest run` (**780 passed**, +4 de `customers-actions`; el único rojo es el flaky de cloud `billing/cuenta.integration` por timeout de red, ajeno — pasa 11/11 con `--test-timeout=30000`) + `build` **OK**.

## Cierre
- [x] **T014** `pnpm typecheck` (limpio) + `pnpm vitest run` (**776+ passed**, flaky de cloud ajeno) + `pnpm build` (**OK**).
- [ ] **T015** Verify en vivo con **rol real** (encargado) — **pendiente** (requiere sesión de encargado + caja abierta + AFIP sandbox): cargar para-llevar y delivery → «Confirmar» (comanda impresa) → «Cobrar/Facturar» (caja + Factura B, y A con CUIT) → factura ARCA autorizada. Luego: actualizar `wiki/features/pagos.md` + `wiki/features/cobros.md` + `wiki/specs/README.md` (→ ✅) + `wiki/log.md`. Comentar + cerrar issue #83. Bump del submódulo en el brain.
