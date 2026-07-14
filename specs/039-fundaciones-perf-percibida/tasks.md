# Tasks: Fundaciones de performance percibida (Operación + Mozo)

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Issue**: [#56](https://github.com/gachetponzellini/RestaurantOS-app/issues/56)

Orden por dependencia. `[P]` = paralelizable.

## Fase A — Primitivas (F1/F2 base)

- [x] **T001** `src/components/ui/skeleton.tsx` — `Skeleton` base (bloque con `animate-pulse`) reutilizable. **FR-003**.
- [x] **T002** [P] `src/components/shared/error-boundary.tsx` — `ErrorBoundary` de cliente (class, `getDerivedStateFromError`) con `fallback` render-prop. **FR-007/011**.

## Fase B — F1 · Skeletons de navegación (US1)

- [x] **T003** `src/components/skeletons/mesa-route-skeleton.tsx` — skeletons que calcan header (back + label) + contenido de `pedir` / `cuenta` / `cobrar`. **FR-002**.
- [x] **T004** `src/components/skeletons/operacion-skeleton.tsx` — skeleton del chrome (barra de tabs) + plano de Salón. **FR-002**.
- [x] **T005** [P] `loading.tsx` en `mozo/`, `mozo/mesa/[id]/{pedir,cuenta,cobrar}`, `admin/(authed)/mesa/[id]/{pedir,cuenta,cobrar}`, `admin/(authed)/operacion`. **FR-001**.

## Fase C — F2 · Streaming de Operación (US2/US3)

- [x] **T006** `operacion/counts.ts` — predicados puros de pills (pedidos/comandas/salon/caja/rendicion/fichaje) a partir del dato de su grupo. **FR-012**.
- [x] **T007** `operacion/counts.test.ts` — unit de los predicados (identidad de criterio + ventana "hoy" TZ negocio). **FR-012**. *(rojo→verde)*
- [x] **T008** `operacion/data.ts` — loaders server por grupo (salon/comandas/pedidos/caja/rendicion/fichaje) que mueven query+transform actuales **conservando `business_id`**. Devuelven promesas (no `await`). **FR-010**.
- [x] **T009** `operacion/page.tsx` — `await` auth+gate+business (arriba del boundary, **FR-008**), luego crear las 6 promesas y pasarlas a `LocalShell`. Quitar el `Promise.all(15)`.
- [x] **T010** `local-shell.tsx` — recibir promesas; panel de cada tab con `use()` en `<Suspense fallback={skeleton}>`; pills con `use()`+`<Suspense fallback={—}>`; Caja/Rendición envueltas en `ErrorBoundary` (panel: retry; pill: `—`). Mantener Pedidos siempre montado. **FR-004/005/006/007/011**.

## Fase D — F3 · Convención action-returns-row (US4)

- [x] **T011** [P] `docs/conventions/action-returns-row.md` — documentar la convención. **FR-013**.
- [x] **T012** [P] `src/lib/caja/rendicion-shape.test.ts` — `expectTypeOf` de que el éxito de `registrarRendicionMozo` incluye `rendicion: MozoRendicion`. **FR-014**. *(sin DB)*

## Fase E — Verify gate

- [x] **T013** `pnpm typecheck` + `pnpm test` en verde. **SC-005**.
- [ ] **T014** Verify en vivo con rol real (mozo + encargado): skeletons en navegación, Salón desbloqueado, pill sin "0" falso, sin-permiso redirige sin exponer contenido. **SC-001/002/003/005/006**.
- [x] **T015** Cierre de loop: features page + `wiki/log.md`, comentar + close #56, bump submódulo.

> **T014** requiere `pnpm dev` + rol real (mozo/encargado) — se deja para verificación manual de Juan (no ejecutable headless con datos reales sin sesión).
