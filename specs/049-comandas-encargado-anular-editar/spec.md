# Feature Specification: Encargado — anular y editar comandas ya impresas

**Feature Branch**: `049-comandas-encargado-anular-editar`

**Created**: 2026-07-17

**Status**: En implementación. Issue [#73](https://github.com/gachetponzellini/RestaurantOS-app/issues/73). Milestone: Post-demo · Growth & hardening. Extiende la gestión de comandas de [features/comandas.md](../../../wiki/features/comandas.md) y reusa la reimpresión del [spec 35](../../../wiki/specs/35-reimpresion-y-fallos-de-impresion/).

**Input**: Pedido de Juan 2026-07-17 — "el encargado tiene que poder **cancelar una comanda**, **modificar una comanda que ya fue impresa** (quitar ítems, cambiar cantidades, editar notas, **cambiar el producto**), y que la comanda anulada no siga molestando en el tablero".

## Contexto y problema

Hoy la única gestión de comandas ya emitidas a nivel ítem es `cancelarItem(orderItemId, motivo)` ([`comandas/actions.ts:893`](../../src/lib/comandas/actions.ts)): anula **un** ítem (flow 86 / rotura), con motivo, recalcula el total y avisa al mozo. No hay forma de:

1. **Anular la comanda entera** de un saque (cuando toda la tanda de un sector no va — mesa que se levanta, error de carga, etc.).
2. **Editar** una comanda ya impresa: corregir la cantidad, la nota o **el producto equivocado**, y reimprimir el ticket corregido para que cocina trabaje con lo bueno.

El encargado hoy tiene que anular ítem por ítem (tedioso para una tanda entera) y no tiene ninguna herramienta para corregir un producto mal cargado salvo anular + volver a cargar desde el mozo.

### Lo que ya existe y se reusa

- **Reimpresión en cualquier estado** ([`solicitarReimpresion`](../../src/lib/comandas/actions.ts), spec 35): setea `comandas.reprint_requested_at`; el `GET /api/print-agent` la vuelve a servir aunque ya haya avanzado, y el agente la imprime **sin cambios de su lado** (imprime lo que el GET trae). Es el mecanismo sobre el que montamos tanto el ticket «ANULADA» como el «ticket corregido».
- **Auto-ocultado de comandas fantasma** ([`comandas-kanban.tsx:341`](../../src/components/admin/local/comandas-kanban.tsx)): una comanda activa cuyos ítems están **todos** cancelados ya se oculta del kanban. Anular la comanda entera cancela todos sus ítems → la card desaparece sola. **Esto cubre el "que no molesten"** sin borrar nada (principio 4: todo se audita).
- **Gates de permiso** ([`can.ts`](../../src/lib/permissions/can.ts)): `canCancelItem` y `canModifyPostEnvio` ya devuelven `admin || encargado`. Se reusan tal cual (no se toca `can.ts`).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Anular una comanda entera (Priority: P1)

Como **encargado**, cuando una tanda de un sector no va (mesa que se levanta, error), toco **«Anular comanda»** en la card, escribo el motivo, y la comanda entera queda anulada: todos sus ítems cancelados, el total de la mesa recalculado, un ticket **«ANULADA»** sale en la comandera del sector para que cocina lo descarte, y se avisa al mozo. La card desaparece del tablero.

**Why this priority**: Es el pedido central. Evita anular ítem por ítem y le da a cocina la señal física (papel) de que esa tanda no va.

**Independent Test**: Sobre una comanda `pendiente`/`en_preparacion`, llamar `cancelarComanda(slug, id, motivo)` con rol encargado → todos sus ítems vivos quedan `cancelled_at`, la comanda queda `cancelled_at` + `reprint_requested_at`, el total de la orden baja, y el `GET /api/print-agent` la devuelve con `cancelled: true`.

**Acceptance Scenarios**:

1. **Dado** una comanda con 3 ítems vivos, **Cuando** el encargado la anula con motivo, **Entonces** los 3 ítems quedan `cancelled_at`/`cancelled_reason`/`cancelled_by`, la comanda queda `cancelled_at` y el subtotal/total de la orden se recalculan excluyéndolos.
2. **Dado** esa anulación, **Cuando** el print-agent hace su próximo GET, **Entonces** la comanda aparece (por `reprint_requested_at`) con `cancelled: true` + `cancelled_reason`, y el agente imprime un ticket **ANULADA**.
3. **Dado** que el actor es el encargado, **Cuando** anula, **Entonces** se notifica al **mozo de la mesa** (no al actor); si la mesa no tiene mozo, broadcast a `encargado`.
4. **Dado** un **mozo** (no encargado), **Cuando** intenta `cancelarComanda`, **Entonces** se rechaza (`canCancelItem` = false para mozo).
5. **Dado** una comanda ya **entregada**, **Cuando** se intenta anular, **Entonces** se rechaza ("no se puede anular una comanda ya entregada"): el plato ya salió.
6. **Dado** una comanda de **otro negocio**, **Cuando** se intenta anular con el slug propio, **Entonces** "comanda no encontrada" (scope `business_id`).

---

### User Story 2 — Editar una comanda ya impresa (Priority: P1)

Como **encargado**, sobre una comanda ya impresa, puedo **quitar un ítem**, **cambiar la cantidad**, **editar la nota** o **cambiar el producto** mal cargado, y con **«Guardar y reimprimir»** sale el ticket corregido en la comandera. El total de la mesa se ajusta.

**Why this priority**: Corrige errores sin anular + recargar. "Cambiar el producto" es explícito en el pedido de Juan.

**Independent Test**: Sobre un `order_item` vivo de una comanda, llamar `editarItemComanda(slug, itemId, { quantity, notes, productId })` con rol encargado → el ítem refleja el patch, `unit_price_cents`/`subtotal_cents` se recalculan con el precio (snapshot) del producto nuevo, y el total de la orden se recalcula.

**Acceptance Scenarios**:

1. **Dado** un ítem con cantidad 2, **Cuando** el encargado la cambia a 3, **Entonces** `quantity=3`, `subtotal_cents = (unit_price + mods) * 3` y el total de la orden sube.
2. **Dado** un ítem con nota "sin sal", **Cuando** la edita a "bien cocido", **Entonces** `notes` se actualiza y el ticket reimpreso la muestra.
3. **Dado** un ítem con el producto equivocado, **Cuando** el encargado elige otro producto **del mismo sector**, **Entonces** `product_id`, `product_name` (snapshot) y `unit_price_cents` pasan a los del nuevo, los modificadores del viejo se limpian, y el subtotal se recalcula.
4. **Dado** cualquiera de esas ediciones, **Cuando** el encargado toca «Guardar y reimprimir», **Entonces** se marca `reprint_requested_at` (spec 35) y el agente reimprime el ticket con el estado actualizado.
5. **Dado** un **mozo**, **Cuando** intenta editar, **Entonces** se rechaza (`canModifyPostEnvio` = false para mozo).
6. **Dado** un ítem **cancelado**, **Cuando** se intenta editar, **Entonces** se rechaza ("el ítem está cancelado").

### Edge Cases

- **Quitar un ítem** = `cancelarItem` existente (no se duplica lógica). La UI de edición lo invoca; al quedar la comanda sin ítems vivos, se oculta sola.
- **Ítems de combo / menú del día** (`is_combo_component` o `daily_menu_id`): **fuera de alcance** de la edición en fase 1 (el precio vive en el padre, los hijos van a $0; editarlos rompe el desglose). La UI no ofrece editar esos ítems; la action los rechaza por defensa.
- **Cambiar el producto NO re-rutea de sector.** El ticket físico ya está en la comandera del sector original; el ítem conserva su `station_id`. La UI del picker solo ofrece productos que rutean al **mismo sector**. Si hace falta mover de sector, se anula y se recarga (documentado).
- **Cambiar producto por uno con modificadores requeridos**: en fase 1 el swap **no** re-selecciona modificadores (limpia los del viejo). No se valida `min_selection` del nuevo (override de mostrador). Refinamiento futuro.
- **Anular una comanda `pendiente` nunca impresa**: igual se marca `reprint_requested_at`; el agente imprime el ANULADA (inocuo — cocina ve que esa tanda no va). Si la comandera del sector no tiene `printer_ip`, el agente la saltea (igual que hoy).
- **Concurrencia**: dos anulaciones sobre la misma comanda → la segunda ve `cancelled_at` seteado y es no-op idempotente.

## Requirements *(mandatory)*

### Functional Requirements

**Anular comanda (US1)**

- **FR-001**: `cancelarComanda(slug, comandaId, motivo)` MUST exigir `motivo` no vacío, resolver el negocio por slug, exigir sesión y gate `canCancelItem(role)` (encargado/admin); scope por `orders.business_id`.
- **FR-002**: MUST rechazar si la comanda está `entregado` o ya `cancelled_at`. Sobre `pendiente`/`en_preparacion` procede.
- **FR-003**: MUST marcar todos los `order_items` **vivos** de la comanda con `cancelled_at`/`cancelled_reason`/`cancelled_by`, y marcar la comanda con `cancelled_at`/`cancelled_reason`/`cancelled_by`.
- **FR-004**: MUST setear `reprint_requested_at = now()` y limpiar `print_failed_at` para que el print-agent reimprima el ticket ANULADA (reusa el canal del spec 35).
- **FR-005**: MUST recalcular `orders.subtotal_cents` y `orders.total_cents` (subtotal de ítems vivos + tip + fee − discount, `max(0, …)`), igual criterio que `cancelarItem`.
- **FR-006**: MUST notificar la anulación al mozo de la mesa (reusa `notifyItemCancelled` con `reason = "Comanda anulada: <motivo>"`; no autoavisa al actor).

**Editar comanda impresa (US2)**

- **FR-007**: `editarItemComanda(slug, orderItemId, patch)` MUST gate `canModifyPostEnvio(role)` (encargado/admin), scope por `orders.business_id`, y rechazar ítems cancelados o de combo (`is_combo_component`/`parent_order_item_id`/`daily_menu_id`).
- **FR-008**: `patch.quantity` (si viene) MUST ser entero ≥ 1. `patch.notes` (si viene) reemplaza la nota (string o null).
- **FR-009**: `patch.productId` (si viene y difiere) MUST resolver un producto del **mismo negocio**, activo y disponible; snapshotea `product_name` + `unit_price_cents`; conserva `station_id`; limpia los modificadores del ítem (fase 1).
- **FR-010**: MUST recalcular `subtotal_cents` del ítem = `(unit_price_cents + Σ mods) * quantity` y luego `orders.subtotal_cents`/`total_cents`.
- **FR-011**: La UI MUST reimprimir el ticket corregido tras guardar (compone `editarItemComanda` + `solicitarReimpresion`); ambas acciones con **loading explícito, no optimista** (frontera de plata, spec 21).
- **FR-012 (query)**: `getSwappableProducts(slug, stationId)` MUST devolver los productos activos/disponibles del negocio que **rutean al `stationId` dado** (`products.station_id` override > `categories.station_id`), como `{ id, name, price_cents }`, para el picker.

**Impresión (US1)**

- **FR-013**: `GET /api/print-agent` MUST exponer por comanda los campos aditivos `cancelled: boolean` (de `comandas.cancelled_at`) y `cancelled_reason`. Campos aditivos → un agente viejo los ignora.
- **FR-014**: El print-agent de referencia (`agent.mjs`) MUST renderizar un ticket **ANULADA** (encabezado destacado + motivo) cuando `cancelled` es true. Un agente viejo, al ignorar el flag, reimprime el ticket normal (degradación aceptable, documentada).

**UI (US1, US2)**

- **FR-015**: La card del kanban de Comandas MUST ofrecer, en comandas activas (no entregadas, no anuladas), **«Anular comanda»** (con modal de motivo) y **«Editar»** (modal de edición de ítems). Ambas con loading explícito.

### Key Entities

- **`comandas`**: nuevas columnas `cancelled_at` / `cancelled_reason` / `cancelled_by` (migración `0016`, aditiva). Reusa `reprint_requested_at` / `print_failed_at` (spec 35).
- **`order_items`**: reusa `cancelled_at` / `cancelled_reason` / `cancelled_by` (baseline / spec 34) y `station_id` / `product_name` / `unit_price_cents` / `subtotal_cents` (se re-snapshotean al editar).

### Non-Goals (fuera de alcance)

- **Borrado real o archivado de comandas**: descartado por Juan. La anulación ya saca la card del tablero sin destruir el registro (auditoría intacta).
- **Agregar ítems nuevos a una comanda impresa**: el flujo de "sumar" ya existe (nueva tanda vía `enviarComanda` desde el mozo). No se replica acá.
- **Editar ítems de combo / menú del día** y **re-selección de modificadores** al cambiar producto: fase 2.
- **Re-ruteo de sector** al cambiar producto: fuera de alcance (el ticket físico ya está en un sector).
- **Ticket ANULADA vía push instantáneo (SSE/LISTEN-NOTIFY)**: sigue el poll del agente (piso ~1-2 s), igual que specs 33/35.

## Success Criteria *(mandatory)*

- **SC-001**: El encargado anula una comanda entera con motivo; sus ítems y la comanda quedan anulados, el total de la mesa se recalcula, y la card sale del tablero. El mozo recibe el aviso.
- **SC-002**: El print-agent reimprime un ticket **ANULADA** (con motivo) en la comandera del sector de una comanda anulada.
- **SC-003**: El encargado edita cantidad, nota y **producto** de un ítem impreso; el total se ajusta y «Guardar y reimprimir» saca el ticket corregido.
- **SC-004**: Mozo no puede anular ni editar (gates). Todo scopeado por `business_id`.
- **SC-005**: `pnpm typecheck` + `pnpm test` en verde con tests que blindan FR-001..FR-010 y FR-013. Verify en vivo con **rol real** (encargado) + print-agent (ticket ANULADA y ticket corregido).
