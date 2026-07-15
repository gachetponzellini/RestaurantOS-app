# Tasks: Navegabilidad de operación (encargado) — cursor, Esc y Enter

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Issue**: [#60](https://github.com/gachetponzellini/RestaurantOS-app/issues/60)

## Fase A — Cursor (US1) · barato y global

- [x] **T001** `src/app/globals.css` — `@layer base` con `button:not(:disabled), [role="button"]:not([aria-disabled="true"]), summary { cursor: pointer; }`. Repone el default que Tailwind v4 sacó del Preflight. **FR-001/002**.

## Fase B — Hook de escape (US2) · TDD

- [x] **T002** `src/lib/ui/use-escape-to-close.test.ts` — unit **rojo→verde**: `Escape` llama `onClose`; otra tecla no; cleanup al desmontar; `enabled: false` no engancha. 4/4 verde. **FR-005**.
- [x] **T003** `src/lib/ui/use-escape-to-close.ts` — `useEscapeToClose(onClose, enabled = true)`: `useEffect` con listener `keydown` + cleanup.

## Fase C — Migrar modales a Dialog/Sheet + `<form>` (US2 + US3)

- [x] **T004** `catalog/ingredient-import-dialog.tsx` — Dialog + `DialogTrigger` + `<form onSubmit>` + `type=submit`. Sentó el patrón.
- [x] **T005** `stock/stock-bar-tab.tsx` — `AddBarProduct` → Dialog; paso 2 (qty) en `<form>` con `type=submit`; select de producto `type=button`.
- [x] **T006** `stock/stock-cocina-tab.tsx` — `ModalOverlay`/`ModalHeader` compartidos → Dialog + `DialogTitle` (Ingreso y Ajuste ganan Esc de una); cada modal envuelto en `<form>` con `type=submit`.
- [x] **T007** `local/new-reservation-modal.tsx` — `Sheet side="bottom"` (`sm:mx-auto sm:max-w-lg`) → preserva bottom-sheet mobile + centrado abajo en desktop; `<form>` + botón `type=submit`.
- [x] **T008** `local/fichaje-tab.tsx` — numpad → Dialog (look oscuro preservado, `showCloseButton={false}` + X propia). Auto-envía al 4º dígito → sin Enter; solo Esc.
- [x] **T009** `local/salon-desktop.tsx` — prompt "anular" → Dialog (Esc = cancelar). **Destructivo:** NO se cablea Enter→submit (único campo es `<textarea>`, Enter = salto de línea); anular es click explícito.

## Fase D — Full-screen (US2)

- [x] **T010** `customers/customer-chatbot-view.tsx` — `useEscapeToClose(() => router.push('/<slug>/demo'))` (vista full-screen, no diálogo). **FR-005**.

## Fase E — Prevención + Verify

- [x] **T011** `AGENTS.md` — convención documentada (§Componentes): modales = `Dialog`/`Sheet` compartido; forms = `<form onSubmit>` + `type=submit`; destructivas sin Enter→submit. **FR-011**.
- [x] **T012** `pnpm typecheck` (0 errores) + `pnpm test` (625+ pass; 2 timeouts flaky de cloud confirmados verdes con timeout holgado) + `pnpm build` (OK). **SC-005**.
- [x] **T013** Verify en vivo con rol real (encargado): (a) cursor pointer en admin + mozo + carta, disabled sin pointer; (b) Esc cierra los 6 modales + full-screen, reabrir = limpio; (c) Enter envía cada modal-form con validación, sin doble-submit, textarea = salto de línea. **SC-001..005**. ✅ Validado por Juan (2026-07-14).
- [x] **T014** Cierre: issue #60 **cerrado** (2026-07-14, tras verify); commit + bump submódulo hechos.

> **T013** requiere sesión con rol real (encargado) + datos reales → verificación manual de Juan antes de cerrar el issue.
