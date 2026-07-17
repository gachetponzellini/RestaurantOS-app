# Feature Specification: Atajo "Como entrada" en la observación del ítem

**Feature Branch**: `050-item-como-entrada`

**Created**: 2026-07-17

**Status**: ✅ Done (2026-07-17) — implementada (lógica pura + chip en el modal) + **validada en vivo** en el panel de operación/pedido (mismo `ProductModal` que usa el mozo): el chip "Como entrada" togglea y la línea del carrito muestra la nota compuesta `Como entrada · sin sal`. Issue [#74](https://github.com/gachetponzellini/RestaurantOS-app/issues/74).

**Input**: Pedido de Juan — al cargar un pedido, el mozo/encargado necesita un atajo para dejar como observación que ese ítem lo quieren **como entrada** (que cocina lo saque primero). Decisión de alcance (confirmada): **atajo de observación**, no un campo de tiempo/curso estructurado.

**Issue**: [#74](https://github.com/gachetponzellini/RestaurantOS-app/issues/74)

## Contexto y problema

Cuando un mozo o encargado carga ítems a una mesa (modal de producto de `src/components/mozo/product-modal.tsx`), la única forma de avisarle a cocina que un plato va **como entrada** (sacarlo primero, antes del resto de la mesa) es tipearlo a mano en el campo *Observaciones*. Es fricción en hora pico y queda a criterio de cómo lo escriba cada uno.

La observación del ítem ya viaja por un pipeline existente: `notes` del modal → carrito local del mozo → server action `enviarComanda` → columna `order_items.notes` → card del kanban de comandas (`comandas-kanban.tsx`) **y** ticket físico que arma el print-agent (`api/print-agent/route.ts`). Por eso un marcador de texto "Como entrada" ya alcanza a cocina sin tocar la base de datos.

Esta spec **no** toca plata, permisos ni estados. Es una mejora de UX de carga: agregar un atajo que setea la observación.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Marcar un ítem como entrada con un tap (Priority: P1)

Al cargar un ítem en una mesa, el mozo/encargado quiere marcar con un tap que ese plato va **como entrada**, en vez de escribirlo a mano.

**Why this priority**: Es el único objetivo de la feature. Elimina fricción y homogeniza el texto que ve cocina.

**Independent Test**: Abrir el modal de un producto, tocar el chip "Como entrada", agregar el ítem, y verificar que la observación del ítem empieza con "Como entrada" tanto en el resumen del carrito como en la comanda del kanban / ticket.

**Acceptance Scenarios**:

1. **Dado** el modal de un producto abierto, **Cuando** toco el chip "Como entrada" (sin escribir nada más) y agrego el ítem, **Entonces** la observación del ítem queda exactamente `Como entrada`.
2. **Dado** el chip "Como entrada" activo, **Cuando** además escribo `sin sal` en Observaciones y agrego, **Entonces** la observación queda `Como entrada · sin sal` (el marcador primero).
3. **Dado** el chip activo, **Cuando** lo vuelvo a tocar (destildar) y agrego, **Entonces** la observación **no** incluye el marcador — queda solo el texto libre (o vacío).
4. **Dado** un ítem agregado con "Como entrada", **Cuando** miro la comanda en el kanban y el ticket impreso, **Entonces** el marcador aparece en la observación del ítem.
5. **Dado** que cambio de producto (abro el modal de otro), **Cuando** se abre, **Entonces** el chip arranca **destildado** (no arrastra el estado del ítem anterior).

### Edge Cases

- **Tope de 200 chars**: la observación final compuesta (marcador + texto libre) se trunca a 200 caracteres, priorizando el marcador (va al frente). El contador visible sigue reflejando el texto libre.
- **Texto libre que ya dice "entrada"**: no se hace deduplicación semántica; si el mozo tipeó "entrada" y además tildó el chip, se compone igual (`Como entrada · entrada`). Aceptable: el chip es explícito.
- **Marcador sin texto libre**: la observación es solo `Como entrada`, sin separador colgando.
- **Espacios**: el texto libre se `trim`ea antes de componer; si queda vacío no se agrega separador.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El modal de carga de ítem del mozo/encargado (`product-modal.tsx`) DEBE ofrecer un control de atajo ("Como entrada") junto al campo Observaciones, con estado visual claro de tildado/destildado y buen tamaño de tap (mobile-first).
- **FR-002**: Al agregar el ítem con el atajo activo, la observación (`notes`) DEBE anteponer el marcador `Como entrada` al texto libre, separados por ` · ` cuando hay texto libre.
- **FR-003**: Con el atajo inactivo, la observación DEBE ser el texto libre tal cual (comportamiento actual, sin regresión).
- **FR-004**: La observación compuesta DEBE respetar el tope de 200 caracteres, conservando el marcador al frente.
- **FR-005**: El estado del atajo DEBE resetearse a inactivo cuando se abre el modal de otro producto (igual que `notes`, `quantity`, `selection`).
- **FR-006**: La lógica de composición del texto DEBE vivir en una función pura, testeable y aislada de la UI (TDD).

### Non-Goals

- Modelar un campo estructurado de **tiempo/curso** (entrada/principal/postre) en `order_items` ni secuenciar/agrupar la comanda por tiempo.
- Aplicarlo al **menú del día** del mozo (es un combo que ya trae entrada/principal/bebida) ni a la **carta pública online**.
- Cambiar cómo cocina/print-agent renderiza la observación (se aprovecha el render de `notes` existente).

## Key Entities

Sin entidades nuevas. Se reutiliza la columna existente `order_items.notes` (text). Sin migración.
