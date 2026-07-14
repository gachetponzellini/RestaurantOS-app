# Implementation Plan: Navegabilidad de operación (encargado) — cursor, Esc y Enter

**Branch**: `master` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md) | **Issue**: [#60](https://github.com/gachetponzellini/RestaurantOS-app/issues/60)

## Summary

Tres fricciones de navegación en la operación del encargado, sin tocar datos ni server:

1. **Cursor (US1)** — una regla `@layer base` en `globals.css` que repone `cursor: pointer` para `button:not(:disabled)`, `[role="button"]` y `summary`. Global, una línea de root-cause.
2. **Esc cierra (US2)** — migrar 6 modales custom (`<div fixed inset-0>`) al `Dialog`/`Sheet` compartido (Base UI), que ya trae Esc + focus-trap + backdrop. Para la vista full-screen que no es diálogo (`customer-chatbot-view`), un hook `useEscapeToClose`.
3. **Enter envía (US3)** — al migrar, envolver cada modal-form en `<form onSubmit>` con el botón primario `type="submit"`; los secundarios quedan `type="button"`.

El solapamiento US2↔US3 hace que **una misma migración por modal** resuelva Esc y Enter juntos.

## Technical Context

**Language/Version**: TypeScript 5 · React 19.1 · Next.js 15.5 · Tailwind v4.
**UI**: shadcn sobre **Base UI** (`@base-ui/react`) — `Dialog`/`Sheet` ya con Esc + focus-trap. **No hay** `alert-dialog`.
**Storage**: **sin migraciones**. Cero datos/RLS/permisos.
**Testing**: Vitest — el hook `useEscapeToClose` se puede testear puro (listener + cleanup); el resto es verify en vivo (comportamiento de teclado/cursor no es unit-testeable de forma barata).
**Constraints**: preservar cada modal sin regresión visual/funcional (mismos campos, validación y responsive); no interceptar Enter en `<textarea>`; no permitir doble-submit.
**Scope**: 1 regla CSS + 1 hook nuevo + migración de 6 modales + 1 full-screen + nota en AGENTS.md.

## Constitution Check

*GATE — cambio de UI sin dinero/datos; el riesgo es regresión de comportamiento existente.*

| Principio | Impacto | Cómo se respeta |
|---|---|---|
| I · Multi-tenancy | Nulo | No cambian queries ni scope. |
| II · Test-First | Bajo | El hook se cubre con unit; el resto es verify en vivo (SC-005). No hay lógica de dominio nueva. |
| III · Server Actions + Zod | Nulo | No se agregan/mutan actions; los forms conservan su submit actual (solo se envuelven en `<form>`). |
| IV · Dinero en centavos | Nulo | — |
| V · Secretos | Nulo | — |
| VI · Spec-Driven | — | Este plan es el gate. |
| VII · Migraciones | Nulo | **Sin migración.** |

## Decisiones clave

- **Cursor en `globals.css`, no en `buttonVariants`.** Editar el cva cubriría solo el componente `Button`; una regla `@layer base` cubre además los `<button>` nativos, `[role="button"]` (cards clickeables) y `<summary>` con una sola fuente. Es exactamente lo que Tailwind v4 sacó del Preflight.
- **Migrar a Dialog, no parchar con `keydown` por modal.** Un handler de Escape ad-hoc por modal arreglaría el síntoma pero dejaría dos formas de hacer modales en el código. Migrar al componente compartido da Esc + Enter (vía form) + focus-trap + backdrop + consistencia, y borra deuda.
- **Hook `useEscapeToClose` solo para lo que no es diálogo.** `customer-chatbot-view` es una vista full-screen (no un diálogo con backdrop), migrarla a Dialog cambiaría su naturaleza. Un hook chico (`useEffect` + listener `keydown` + cleanup) cierra el gap sin desnaturalizarla.
- **`<form>` envuelve, no reescribe.** Los handlers de submit actuales (`handleSubmit`/`handleImport`/`handleAdd`) se mantienen; solo se conectan a `onSubmit` del `<form>` y el botón primario pasa a `type="submit"`. Mínimo diff, máxima paridad.

## Project Structure

```text
src/app/globals.css                                   # MOD · @layer base { button:not(:disabled), [role=button], summary { cursor: pointer } }
src/lib/ui/use-escape-to-close.ts                     # NEW · hook (listener keydown Escape + cleanup) + test
src/lib/ui/use-escape-to-close.test.ts                # NEW · unit (dispara onClose en Escape, cleanup al desmontar)

# Migración a Dialog/Sheet + <form> (6 modales)
src/components/admin/local/new-reservation-modal.tsx  # MOD · Sheet(bottom mobile)/Dialog + <form onSubmit> + type=submit; preservar responsive
src/components/admin/local/salon-desktop.tsx          # MOD · prompt "anular" → Dialog de confirmación (Esc = cancelar)
src/components/admin/local/fichaje-tab.tsx            # MOD · Dialog
src/components/admin/stock/stock-cocina-tab.tsx       # MOD · Dialog + <form> (botones secundarios quedan type=button)
src/components/admin/stock/stock-bar-tab.tsx          # MOD · Dialog + <form>
src/components/admin/catalog/ingredient-import-dialog.tsx  # MOD · Dialog + <form>

# Full-screen (no es diálogo)
src/components/admin/customers/customer-chatbot-view.tsx    # MOD · useEscapeToClose(onClose)

AGENTS.md                                             # MOD · convención modales/forms (FR-011)
```

## Riesgos y mitigación

- **Regresión de responsive** (bottom-sheet de reservas). Mitigación: usar `Sheet side="bottom"` en mobile o Dialog con las mismas clases `sm:`; verificar en viewport mobile.
- **Doble estado de "abierto"** al migrar (el `open` custom vs `onOpenChange` del Dialog). Mitigación: cablear `onOpenChange` al mismo setter/`onClose` que ya existía; un solo source of truth.
- **Botón secundario que pasa a submit por descuido.** Mitigación: auditar que solo el primario sea `type="submit"`; los "+ agregar", "Cancelar", etc. explícitamente `type="button"` (FR-009).
- **Cursor global sobre elementos no interactivos con `role="button"`.** Bajo riesgo (role=button implica interactivo); si aparece algún falso positivo, se acota el selector.

## Verificación (rol real — encargado)

1. **Cursor**: hover por salón/caja/stock/catálogo/config → pointer en todos; un botón disabled → sin pointer.
2. **Esc**: abrir cada modal migrado + full-screen chatbot → Escape cierra; reabrir → estado limpio.
3. **Enter**: en cada modal-form, tipear + Enter → submit con validación; Enter repetido con `isPending` → sin doble-envío; Enter en textarea → salto de línea.
4. `pnpm typecheck && pnpm test && pnpm build` verde.
