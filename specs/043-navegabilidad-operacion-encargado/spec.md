# Feature Specification: Navegabilidad de operación (encargado) — cursor, Esc y Enter

**Feature Branch**: `043-navegabilidad-operacion-encargado`

**Created**: 2026-07-14

**Status**: Implemented (2026-07-14) — `pnpm typecheck` + `pnpm test` + `pnpm build` en verde. **Pendiente:** verify en vivo con rol real (encargado) — T013. Issue [#60](https://github.com/gachetponzellini/RestaurantOS-app/issues/60). Milestone: Post-demo.

**Input**: Pedido de Juan 2026-07-14 — "manejar la navegabilidad en toda la parte operacional del encargado: que los botones tengan cursor pointer en hover, que Enter envíe el form y que Esc cierre el modal".

## Contexto y problema

La operación del encargado (rutas bajo `src/app/[business_slug]/admin/`) tiene tres fricciones de teclado/mouse que rompen el "se siente app nativa". Tienen **root-causes distintas** pero un **solapamiento clave** que las une:

1. **Cursor.** Tailwind v4 eliminó el `cursor: pointer` del Preflight para `<button>`, y ni `buttonVariants` (`src/components/ui/button.tsx:6`) ni `globals.css` lo reponen. Resultado: **ningún** botón del sistema muestra la manito en hover — se pierde la affordance de "esto es clickeable". Es global, no solo del admin.

2. **Esc no cierra.** Los diálogos construidos sobre el `Dialog`/`Sheet` compartido (Base UI, `@base-ui/react/dialog`) ya cierran con Escape gratis. Pero **6 modales custom** están escritos a mano como `<div className="fixed inset-0 …">` con estado propio y **no heredan** ese comportamiento: no responden a Escape.

3. **Enter no envía.** Esos **mismos 6 modales** no son `<form>` reales: son colecciones de inputs con un botón `type="button"` + `onClick`. Como no hay `<form>`, presionar Enter en un campo no dispara nada.

**El solapamiento:** los 6 modales que fallan en Esc son exactamente los que fallan en Enter. Migrarlos al `Dialog`/`Sheet` compartido **y** envolverlos en un `<form onSubmit>` con botón `type="submit"` **resuelve las dos cosas de una** y de yapa suma focus-trap + consistencia visual.

### Inventario de modales custom en la operación del encargado

Overlays `fixed inset-0` bajo `src/components/admin/` (grep 2026-07-14):

| Archivo | Qué es | Esc hoy | Enter hoy | Destino |
|---|---|---|---|---|
| `local/new-reservation-modal.tsx:113` | Alta de reserva (form) | ❌ | ❌ | **Dialog/Sheet + `<form>`** |
| `local/salon-desktop.tsx:1145` | Prompt "anular" (confirmación) | ❌ | ❌ | **Dialog de confirmación** |
| `local/fichaje-tab.tsx:190` | Modal de fichaje | ❌ | ❌ | **Dialog** |
| `stock/stock-cocina-tab.tsx:691` | Modal de stock cocina (form) | ❌ | ❌ | **Dialog + `<form>`** |
| `stock/stock-bar-tab.tsx:311` | Modal de stock bar (form) | ❌ | ❌ | **Dialog + `<form>`** |
| `catalog/ingredient-import-dialog.tsx:174` | Import de ingredientes (form) | ❌ | ❌ | **Dialog + `<form>`** |
| `customers/customer-chatbot-view.tsx:130` | Vista full-screen (no es diálogo) | ❌ | n/a | **hook `useEscapeToClose`** |
| `chatbot-tester.tsx:188` | Expand de tester | ✅ (ya tiene handler) | n/a | sin cambios |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Todo botón se siente clickeable (Priority: P1)

Como encargado, cuando paso el mouse sobre cualquier botón del panel, el cursor cambia a manito (`pointer`) para confirmarme que es clickeable. Hoy siempre veo la flecha, como si fuera texto muerto.

**Why this priority**: Es la fricción más visible y de arreglo más barato (una regla CSS global). Afecta cada pantalla del admin.

**Independent Test**: Hover sobre botones en salón, caja, stock, catálogo, configuración → el cursor es `pointer` en todos. Un botón `disabled` **no** muestra pointer.

**Acceptance Scenarios**:

1. **Dado** cualquier `<Button>` habilitado, **Cuando** le hago hover, **Entonces** el cursor es `pointer`.
2. **Dado** un `<button>` nativo o un elemento con `role="button"` (cards clickeables, `<summary>`), **Cuando** le hago hover, **Entonces** el cursor es `pointer`.
3. **Dado** un botón `disabled` / `aria-disabled`, **Cuando** le hago hover, **Entonces** el cursor **no** es `pointer` (queda default/`not-allowed`), coherente con que no es accionable.

---

### User Story 2 - Esc cierra el modal (Priority: P1)

Como encargado, cuando tengo un modal abierto (alta de reserva, confirmación de anular, stock, import…), presiono **Escape** y el modal se cierra sin guardar nada, tal como si hubiera tocado "Cancelar" o el fondo.

**Why this priority**: En hora pico el encargado abre y descarta modales constantemente; obligarlo a apuntar al botón cerrar rompe el flujo. La mayoría de los diálogos ya lo hacen — el objetivo es que **todos** se comporten igual.

**Independent Test**: Abrir cada uno de los 6 modales custom + la vista full-screen del chatbot y presionar Esc → se cierran. Ningún cambio queda persistido por cerrar con Esc.

**Acceptance Scenarios**:

1. **Dado** un modal de operación abierto, **Cuando** presiono Escape, **Entonces** el modal se cierra y equivale a cancelar (no persiste, no dispara la acción).
2. **Dado** la vista full-screen `customer-chatbot-view`, **Cuando** presiono Escape, **Entonces** la vista se cierra.
3. **Dado** un modal cerrado con Esc, **Cuando** lo reabro, **Entonces** su estado arranca limpio (no conserva lo tipeado antes de cancelar), igual que hoy al cancelar con el botón.

---

### User Story 3 - Enter envía el form del modal (Priority: P2)

Como encargado, cuando completo un modal con formulario (alta de reserva, stock, import) y presiono **Enter** en un campo, el formulario se envía — no tengo que soltar el teclado para ir a clickear "Guardar".

**Why this priority**: Acelera la carga repetitiva (reservas, movimientos de stock). Prioridad P2 porque es menos crítico que cerrar, y solo aplica a los modales con form (no a los de solo-confirmación con un único botón).

**Independent Test**: En cada modal-form, tipear en un campo y presionar Enter → se dispara el mismo submit que el botón primario, con la misma validación.

**Acceptance Scenarios**:

1. **Dado** un modal con un `<form>` y datos válidos, **Cuando** presiono Enter en un campo de texto, **Entonces** se dispara el submit (equivalente a clickear el botón primario).
2. **Dado** que el submit ya está en vuelo (`isPending`/`disabled`), **Cuando** presiono Enter de nuevo, **Entonces** **no** se dispara un segundo submit (sin doble-envío).
3. **Dado** un modal con validación (Zod/react-hook-form), **Cuando** presiono Enter con datos inválidos, **Entonces** se muestran los errores igual que al clickear (Enter no saltea la validación).
4. **Dado** un `<textarea>` multilínea dentro del form, **Cuando** presiono Enter, **Entonces** inserta salto de línea y **no** envía (comportamiento nativo preservado).

### Edge Cases

- **Botón secundario dentro del form**: los botones que NO son el submit (ej. "Cancelar", "+ agregar fila") deben seguir siendo `type="button"` para que Enter no los dispare por accidente.
- **Bottom-sheet en mobile**: `new-reservation-modal` hoy es bottom-sheet en mobile (`items-end`) y centrado en desktop; la migración debe **preservar** ese responsive (Sheet `side="bottom"` en mobile o Dialog con las mismas clases).
- **Confirmaciones sin form** (`salon-desktop` anular): si el prompt tiene un campo de motivo, Enter confirma; si es solo sí/no, Enter no aplica y solo importa Esc = cancelar.
- **Cerrar con Esc durante un submit en vuelo**: si la acción ya está corriendo, Esc no debe dejar la UI en estado inconsistente (preferible bloquear el cierre mientras `isPending`, igual que hoy con el botón).
- **Doble fuente de cierre**: al migrar a Dialog, el `onClose` custom y el `onOpenChange` del Dialog deben ser el mismo camino (no dos estados de "abierto" desincronizados).

## Requirements *(mandatory)*

### Functional Requirements

**Cursor (US1)**

- **FR-001 (ADDED)**: `globals.css` MUST agregar una regla `@layer base` que restaure `cursor: pointer` para `button:not(:disabled)`, `[role="button"]:not([aria-disabled="true"])` y `summary` — reponiendo el default que Tailwind v4 eliminó del Preflight. Alcance **global** (admin + mozo + carta), fuente única.
- **FR-002**: Un botón deshabilitado (`:disabled` / `aria-disabled="true"`) MUST NOT mostrar `cursor: pointer` (queda coherente con que no es accionable; el `disabled:pointer-events-none` ya presente en `Button` se preserva).

**Esc cierra (US2)**

- **FR-003 (MODIFIED)**: Los 6 modales custom del inventario (`new-reservation-modal`, `salon-desktop` prompt anular, `fichaje-tab`, `stock-cocina-tab`, `stock-bar-tab`, `ingredient-import-dialog`) MUST cerrarse con Escape.
- **FR-004**: El mecanismo de cierre por Esc MUST provenir de la **migración al componente `Dialog`/`Sheet` compartido** (Base UI, que ya trae Esc + focus-trap + backdrop), no de handlers `keydown` ad-hoc por modal. Un solo patrón para todos.
- **FR-005 (ADDED)**: Las vistas **full-screen que no son diálogos** (`customer-chatbot-view`) MUST cerrarse con Escape vía un hook reutilizable `useEscapeToClose(onClose)` (para los casos donde migrar a Dialog no aplica).
- **FR-006**: Cerrar con Esc o clic en el backdrop MUST ser **equivalente a Cancelar**: no persiste datos, no dispara la acción del modal, y al reabrir el estado arranca limpio (paridad con el comportamiento actual del botón Cancelar).

**Enter envía (US3)**

- **FR-007 (MODIFIED)**: Cada modal con campos de entrada (`new-reservation-modal`, `stock-cocina-tab`, `stock-bar-tab`, `ingredient-import-dialog`, y el prompt de `salon-desktop` si tiene motivo) MUST estructurarse como un `<form onSubmit={…}>` real con el botón primario en `type="submit"`, de modo que Enter dispare el submit.
- **FR-008**: El submit por Enter MUST pasar por la **misma validación y guardas** que el click (Zod/react-hook-form donde aplique) y MUST respetar el estado `isPending`/`disabled` para **no** permitir doble-submit (consistente con [spec 41](../041-mozo-instantaneo/spec.md) FR-013).
- **FR-009**: Los controles no-primarios dentro del form (Cancelar, agregar fila, etc.) MUST seguir siendo `type="button"` para que Enter no los active.
- **FR-010**: El comportamiento nativo de `<textarea>` (Enter = salto de línea) MUST preservarse (no interceptar Enter globalmente).

**Prevención**

- **FR-011 (ADDED)**: `AGENTS.md` MUST documentar la convención: *modales = componente `Dialog`/`Sheet` compartido (nunca `<div fixed inset-0>` a mano); formularios = `<form onSubmit>` con botón `type="submit"`* — para que no se vuelva a filtrar en features nuevas.

### Non-Goals (fuera de alcance)

- **Rediseño visual** de los modales migrados: se preservan los mismos campos, textos, validaciones y responsive. Solo cambia el **contenedor** (div custom → Dialog/Sheet).
- **Modales fuera de la operación del encargado**: el cursor sí es global, pero la migración de modales/forms se acota a `src/components/admin/`. Los modales del **mozo** ya se tratan en su propia línea ([spec 39](../039-fundaciones-perf-percibida/spec.md) / [41](../041-mozo-instantaneo/spec.md)).
- **`chatbot-tester`**: ya cierra con Esc; migrarlo por consistencia es opcional, no bloqueante.
- **Atajos de teclado nuevos** (Cmd+K, navegación por flechas, focus-management avanzado más allá del que da el Dialog): fuera de alcance.
- **Datos / schema / RLS / permisos**: cero cambios. No hay migración.

### Key Entities

Sin entidades ni migraciones. Puro UI: componentes `Dialog`/`Sheet` ya existentes, un hook nuevo (`useEscapeToClose`) y una regla CSS.

## Success Criteria *(mandatory)*

- **SC-001**: Todo botón habilitado (Button, `<button>` nativo, `[role="button"]`, `summary`) muestra `cursor: pointer` en hover en admin, mozo y carta; los deshabilitados no.
- **SC-002**: Los 6 modales custom + la vista full-screen del chatbot cierran con Escape; cerrar con Esc equivale a cancelar (sin persistir).
- **SC-003**: En cada modal-form, Enter en un campo dispara el submit con la misma validación, sin doble-submit; el `<textarea>` sigue haciendo salto de línea.
- **SC-004**: Cero regresión funcional/visual de los modales migrados: mismos campos, misma acción, mismo responsive (incl. bottom-sheet mobile de reservas).
- **SC-005**: `pnpm typecheck` + `pnpm test` + `pnpm build` en verde. Verificación en vivo con **rol real** (encargado) de los 3 comportamientos.

## Assumptions

- El proyecto usa **Base UI** (`@base-ui/react`), no Radix; su `Dialog`/`Sheet` ya cierran con Esc + focus-trap por default (verificado en `src/components/ui/dialog.tsx` y `sheet.tsx`).
- **No existe** `alert-dialog.tsx` en `ui/`; las confirmaciones (anular) se hacen con `Dialog` compartido.
- Los 6 modales son locales a `src/components/admin/`; nadie externo depende de su estructura interna de div, así que migrarlos no rompe imports.
- El cursor se resuelve mejor en `globals.css` (`@layer base`) que editando `buttonVariants`, porque cubre también `<button>` crudos y `[role="button"]` con una sola fuente.
