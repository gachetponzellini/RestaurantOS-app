# Implementation Plan: Carga de pedido por teclado en el sidebar del salón

**Branch**: `master` | **Date**: 2026-07-23 | **Spec**: [spec.md](./spec.md) | **Issue**: [#81](https://github.com/gachetponzellini/RestaurantOS-app/issues/81)

## Summary

Rediseño keyboard-first del panel de carga (`MozoPedirClient`) **acotado al modo `embedded`** (el sidebar del salón, PC con teclado), sin tocar datos, `enviarComanda`, plata ni estados. Cuatro movimientos:

1. **Buscador fijo + con foco (US1, US4)** — sacar el input del `<main>` scrolleable y anclarlo arriba del panel; autofocus **solo si `embedded`**; navegación de resultados por ↓/↑/Enter.
2. **Vista única con pedido visible (US2)** — fusionar los dos steps (`catalogo` + `resumen`) en una sola vista de 3 zonas verticales para `embedded`: **buscador (fijo) / resultados (scroll) / pedido (panel inferior)**. El full-screen del mozo conserva su flujo actual.
3. **Modal por teclado (US3)** — migrar `ProductModal` al `Dialog`/`Sheet` compartido (Esc + focus-trap) + `<form onSubmit>` con "Agregar" en `type="submit"`; foco inicial; foco vuelve al buscador al cerrar/agregar.
4. **Enviar por teclado (US5)** — atajo (Ctrl/Cmd+Enter) que dispara el `handleSend` existente respetando su guarda `isPending`.

La lógica pura extraíble (selección de resultado por índice: mover, clamp, reset al re-buscar) va a un módulo testeable (TDD); el resto (foco, Esc, atajos) se verifica en vivo.

## Technical Context

**Language/Version**: TypeScript 5 · React 19.1 · Next.js 15.5 (App Router) · Tailwind v4.
**UI**: shadcn sobre **Base UI** (`@base-ui/react`) — `Dialog`/`Sheet` ya con Esc + focus-trap (verificado en spec 043). Hook `useEscapeToClose` disponible (`src/lib/ui/use-escape-to-close.ts`).
**Estado**: carrito `useState<CartItem[]>` efímero en `pedir-client.tsx` (sin cambios de naturaleza). **Sin Zustand, sin persistencia.**
**Storage**: **sin migraciones**. Cero datos/RLS/permisos.
**Testing**: Vitest — se cubre con unit la lógica pura de selección (`product-search.ts`); teclado/foco/Esc = verify en vivo (no unit-testeable barato).
**Constraints**: reutilizar `enviarComanda`, `ProductModal` (validación de modificadores), `composeItemNotes` **sin cambios de contrato**; gate `embedded` para no regresionar el full-screen táctil; no interceptar Enter en `<textarea>`; respetar el anti-doble-envío (spec 41/42).
**Scope**: 1 componente grande reestructurado (gated por `embedded`) + 1 modal migrado + 1 módulo puro nuevo con test. Sin server, sin datos.

## Constitution Check

*GATE — cambio de UI que termina en un flujo de plata/cocina (`enviarComanda`); el riesgo es regresión de comportamiento existente, no dinero nuevo.*

| Principio | Impacto | Cómo se respeta |
|---|---|---|
| I · Multi-tenancy | Nulo | No cambian queries ni scope; `enviarComanda` intacto. |
| II · Test-First | Medio | La lógica pura de selección de resultado se escribe TDD (`product-search.test.ts`); teclado/foco = verify en vivo (SC-002/004). |
| III · Server Actions + Zod | Nulo | No se agregan/mutan actions; `handleSend`→`enviarComanda` se reusa tal cual. |
| IV · Dinero en centavos | Nulo | No se toca cálculo de totales ni cobro; el subtotal/total mostrado usa los helpers actuales. |
| V · Secretos | Nulo | — |
| VI · Spec-Driven | — | Este plan es el gate; código recién tras aprobar spec+plan. |
| VII · Migraciones | Nulo | **Sin migración.** |

## Decisiones clave

- **Gate por `embedded`, no bifurcar el componente.** El rediseño (vista única, buscador fijo, autofocus, navegación por teclado) se activa cuando `embedded === true`. El full-screen del mozo mantiene su flujo de 2 pasos actual. Se comparte todo el estado y los handlers (carrito, `handleSend`, `ProductModal`); solo cambia el **layout/chrome** según `embedded`. Evita duplicar la lógica de un componente de 1890 líneas y elimina el riesgo de regresión táctil.
- **Vista única en 3 zonas verticales (columna angosta ~`max-w-md`).** No hay ancho para dos columnas. En `embedded` la vista es: `header` (mesa + comensal) → **buscador fijo** → **resultados/catálogo** (`flex-1`, scroll) → **panel de pedido** abajo (lista compacta + total + enviar). El `ResumenStep` deja de ser un `step` navegable y pasa a ser ese panel inferior siempre presente. El panel puede colapsar a una barra de total cuando el foco está cargando y expandirse para editar cantidades — detalle a resolver en la implementación, con `useState` local.
- **Navegación de resultados con estado de índice + lógica pura.** Un `selectedIndex` en `useState` sobre la lista `searchResults`; ↓/↑ mueven con clamp, Enter abre el seleccionado, y al cambiar el query el índice resetea a 0. La transformación pura (`moveSelection(index, delta, length)`, `resetOnQueryChange`) va a `src/lib/mozo/product-search.ts` con tests; el `onKeyDown` del input la consume. Así el teclado tiene una base testeada sin depender de e2e.
- **`ProductModal` → `Dialog`/`Sheet` compartido + `<form>`.** Reemplazar el overlay custom (`if (!open) return null`) por el `Dialog` compartido (Esc + focus-trap gratis, convención spec 043), preservando el modo `embedded` (overlay scopeado al panel). El botón "Agregar al pedido" pasa a `type="submit"` dentro de un `<form onSubmit={handleAdd}>`; `handleAdd` ya valida modificadores (`validate`) y compone notas (`composeItemNotes`) — se reusa. El `useEffect` de reset por `product.id` se conserva; el `open`/`onClose` se cablea a `onOpenChange` (un solo source of truth).
- **Foco encadenado.** Un `ref` al input del buscador; tras `onAdd`/cierre del modal se hace `.focus()` y se limpia el query, para encadenar cargas (FR-013). El autofocus inicial también usa ese ref, gated por `embedded`.
- **Atajo de envío = Ctrl/Cmd+Enter.** Un handler a nivel del panel que, si hay ítems y no `isPending`, dispara `handleSend`. Reusa la guarda existente (no reenvía en vuelo). No se inventa un mecanismo nuevo de envío.
- **Categorías: de tabs primarios a control secundario.** Los tabs de super-categoría dejan el header como navegación primaria; se conservan en un control compacto (dropdown/colapsable) para explorar sin nombre. El buscador ocupa el lugar primario. Detalle visual en la implementación; el requisito (FR-014) es "menos peso, acceso conservado".

## Project Structure

```text
# Lógica pura nueva (TDD)
src/lib/mozo/product-search.ts        # NEW · selección por índice: moveSelection(i, delta, len), clamp, resetOnQueryChange
src/lib/mozo/product-search.test.ts   # NEW · unit (mover con clamp arriba/abajo, wrap o no, reset al cambiar query, lista vacía)

# Panel de carga (gated por `embedded`)
src/app/[business_slug]/mozo/mesa/[id]/pedir/pedir-client.tsx
  # MOD · embedded: vista única (buscador fijo + resultados + panel de pedido); saca el input del <main>;
  #        autofocus al buscador (solo embedded); onKeyDown ↓/↑/Enter con selectedIndex;
  #        foco vuelve al buscador tras agregar; atajo Ctrl/Cmd+Enter → handleSend; categorías a control secundario.
  #        full-screen (mozo): sin cambios de flujo (2 pasos), hereda solo lo que no regresiona.

# Modal de alta
src/components/mozo/product-modal.tsx
  # MOD · migrar a Dialog/Sheet compartido (Esc + focus-trap), preservando overlay `absolute` en embedded;
  #        <form onSubmit={handleAdd}> con "Agregar" type=submit; foco inicial; secundarios type=button;
  #        <textarea> notas conserva Enter=salto de línea; onOpenChange = onClose (un solo estado).

# Verificar (posible ajuste menor de contenedor)
src/components/admin/local/salon-desktop.tsx   # CHECK · alto/scroll del panel que hospeda MozoPedirClient embedded
```

## Riesgos y mitigación

- **Regresión del mozo full-screen (táctil).** El componente es compartido. Mitigación: gate estricto por `embedded` en todo lo nuevo (layout, autofocus, teclado); verificar en viewport mobile que el flujo de 2 pasos sigue igual.
- **Componente de 1890 líneas.** Reestructurar los steps puede romper algo lateral (nav de tabs, menú del día, cancelar ítem). Mitigación: no tocar carrito/envío/estado; cambios acotados al chrome/layout; extraer solo la lógica pura de selección.
- **Migrar `ProductModal` a Dialog cambia el ciclo de montaje.** El reset de estado por `product.id` y el overlay `embedded` (`absolute`) deben preservarse. Mitigación: mantener el `useEffect` de reset y el prop `embedded`; cablear `onOpenChange`→`onClose` como único estado de "abierto".
- **Colisión de teclas** (flechas en steppers de cantidad vs navegación de resultados). Mitigación: el `onKeyDown` de flechas vive en el input del buscador, no global; los steppers manejan su propio foco.
- **Autofocus abriendo teclado virtual en tablet.** Mitigación: autofocus solo si `embedded` (FR-002).
- **Doble-envío por el atajo de teclado.** Mitigación: el atajo pasa por el mismo `handleSend` con su guarda `isPending`/`sentKeys` (specs 41/42); no crea un camino nuevo.

## Verificación (rol real — encargado, en el sidebar del salón)

1. **Solo teclado**: abrir el sidebar de una mesa → foco en buscador → tipear, ↓/↑, Enter → modal → (elegir modificador con teclado) → Enter agrega → foco vuelve al buscador → repetir 3 ítems → Ctrl+Enter envía. Sin tocar el mouse.
2. **Pedido visible**: los 3 ítems aparecen al instante en el panel de pedido con cantidad/subtotal/total; ajustar cantidad y quitar por teclado.
3. **Modal**: Esc cierra sin agregar; producto con modificador requerido + Enter sin elegir → muestra error, no agrega; textarea de notas → Enter = salto de línea.
4. **Categorías**: el buscador es primario y fijo; las categorías siguen accesibles en el control secundario.
5. **No-regresión mobile**: en la tablet del mozo (full-screen), cargar por tap sigue igual; sin autofocus molesto.
6. `pnpm typecheck && pnpm test && pnpm build` en verde.
