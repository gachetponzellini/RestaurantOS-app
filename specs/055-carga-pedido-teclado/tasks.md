# Tasks: Carga de pedido por teclado en el sidebar del salón

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Issue**: [#81](https://github.com/gachetponzellini/RestaurantOS-app/issues/81)

> Estado: 🚧 **implementado 2026-07-23** (typecheck + test + build verde). Todo gated por `embedded`. **Pendiente:** T018 (verify en vivo con rol real) + T019 (cierre).

## Fase A — Lógica pura de selección (US1) · TDD

- [x] **T001** `src/lib/mozo/product-search.test.ts` — unit **rojo→verde**: `moveSelection` (clamp ↓/↑, sin wrap, lista vacía) + `clampIndex` + `resetSelection` (query cambia → 0; sin resultados → -1). 14/14 verde. **FR-003**.
- [x] **T002** `src/lib/mozo/product-search.ts` — funciones puras (`clampIndex`, `moveSelection`, `resetSelection`), sin React/DOM.

## Fase B — Buscador fijo + foco + teclado (US1, US4) · `pedir-client.tsx`

- [x] **T003** Buscador sacado del `<main>` scrolleable → barra **fija** arriba del panel (en el branch `embedded`). **FR-001**.
- [x] **T004** `searchRef` + autofocus al montar **solo si `embedded`**. **FR-002**.
- [x] **T005** `selectedIndex` + `onKeyDown` en el input: ↓/↑ → `moveSelection`, Enter → abre el `ProductModal` del seleccionado; único → Enter lo abre; sin resultados → no-op. Resaltado (ring emerald) + scroll-into-view en `ProductGrid`. **FR-003**.
- [x] **T006** Reset de `selectedIndex` vía `resetSelection` en un `useEffect` sobre `searchResults`. **FR-003**.

## Fase C — Vista única con pedido visible (US2) · `pedir-client.tsx`

- [x] **T007** Branch `if (embedded)`: vista única de 3 zonas (buscador fijo / resultados scroll / panel de pedido). Sin step "resumen". El full-screen (mozo) conserva sus 2 pasos. **FR-005**.
- [x] **T008** Panel de pedido: cada línea con subtotal + total; se refleja al instante; estado vacío ("Todavía no cargaste nada…"). **FR-006/008**.
- [x] **T009** Steppers ±/quitar por teclado (botones, sin colisión con las flechas del buscador). **FR-007**.

## Fase D — `ProductModal` por teclado (US3) · `product-modal.tsx`

- [x] **T010** `useEscapeToClose(onClose, open)` (Esc cierra sin agregar) + focus-trap Tab/Shift+Tab en el panel. Overlay `absolute`/`fixed` preservado. **FR-009/012**.
- [x] **T011** `<form onSubmit={handleAdd}>` con "Agregar" en `type="submit"` (Enter agrega, pasa por `validate`); cerrar/steppers/modificadores → `type="button"`; `<textarea>` conserva Enter=salto de línea. **FR-011/012**.
- [x] **T012** Foco inicial: primer modificador si hay, si no el botón "Agregar". **FR-010**.
- [x] **T013** Tras agregar/cerrar, foco vuelve al buscador (`focusSearch`, embebido) + limpia el query al agregar. **FR-013**.

## Fase E — Categorías secundarias + espacio (US4) · `pedir-client.tsx`

- [x] **T014** Tabs de super-categoría → `<select>` compacto secundario (oculto al buscar); el buscador queda primario. **FR-014**.
- [x] **T015** Layout de columna angosta: buscador fijo + resultados (scroll) + pedido (max-h scroll) sin taparse. **FR-015**.

## Fase F — Enviar por teclado (US5) · `pedir-client.tsx`

- [x] **T016** Atajo Ctrl/Cmd+Enter a nivel del panel → `handleSend` si hay ítems y no `pending` (anti-doble-envío specs 41/42); vacío → no-op; bloqueado con modal abierto. **FR-016**.

## Fase G — No-regresión + Verify

- [x] **T017** `pnpm typecheck` (0 errores) + `pnpm test` (772+ verde; único rojo = integration flaky de cloud `billing/cuenta`, ajeno, pasa con `--testTimeout=45000`) + `pnpm build` (OK). Fix colateral: mock `getMozosByBusiness` mal tipado en `get-comandas-tab-data.test.ts` (preexistente, destrababa el typecheck del repo). **SC-007**.
- [ ] **T018** Verify en vivo con **rol real (encargado)** en el sidebar del salón: (a) cargar N ítems solo con teclado, de abrir a enviar, sin mouse; (b) pedido siempre visible, ítems al instante; (c) modal Esc/Enter/validación/foco-vuelve; (d) categorías secundarias accesibles; (e) **no-regresión** del mozo full-screen (táctil) en tablet. **SC-001..006**.
- [ ] **T019** Cierre: comentar + `gh issue close 81`; actualizar [wiki/features/mozo.md](../../../../wiki/features/mozo.md); bump del puntero en el brain + log.

> **T018** requiere sesión con rol real (encargado) + datos reales en el salón → verificación manual de Juan antes de cerrar el issue.
