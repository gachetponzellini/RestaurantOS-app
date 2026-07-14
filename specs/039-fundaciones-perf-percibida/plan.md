# Implementation Plan: Fundaciones de performance percibida (Operación + Mozo)

**Branch**: `master` (specs 37+ se implementan en `master`, sin rama por feature) | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md) | **Issue**: [#56](https://github.com/gachetponzellini/RestaurantOS-app/issues/56)

**Input**: [spec.md](./spec.md) + análisis [wiki/analyses/perf-percibida-operacion-mozo.md](../../../../wiki/analyses/perf-percibida-operacion-mozo.md).

## Summary

Esconder la latencia de red (app cloud) con **feedback inmediato**, sin tocar lógica de dinero. Tres frentes:

1. **F1 · Skeletons** — `loading.tsx` en las 8 rutas operativas (no existe ninguno hoy) + un componente `Skeleton` base reutilizable que calca la estructura del destino (sin layout-shift).
2. **F2 · Streaming de `/admin/operacion`** — reemplazar el `Promise.all` de 15 queries (que bloquea el primer paint) por **una promesa por grupo de tab**, pasada del server component al client (`LocalShell`) y leída con `use()` dentro de `<Suspense>` + `ErrorBoundary`. Salón pinta apenas resuelven **sus 4 queries**; las demás tabs streamean con su propio skeleton; las pills muestran carga (nunca "0"); Caja/Rendición muestran error explícito si su promesa rechaza.
3. **F3 · Convención action-returns-row** — documentar que las mutaciones devuelven la fila mutada tipada; aplicar (verificar) sobre el piloto `registrarRendicionMozo` (que ya devuelve `{ rendicion }`) con un test de forma. Sin merge local todavía.

## Technical Context

**Language/Version**: TypeScript 5 · React 19.1 · Next.js 15.5 (App Router, Turbopack).
**Primary Dependencies**: `Suspense`/`use()` (React 19), Supabase service client (server), Tailwind v4.
**Storage**: sin cambios — no hay migraciones ni policies nuevas. Trabaja sobre queries existentes.
**Testing**: Vitest 4. Unit puros para predicados de counts; `expectTypeOf` para la forma del `ActionResult` del piloto.
**Target Platform**: web (tablets del salón + desktop del encargado).
**Project Type**: web app multi-tenant (`src/app/[business_slug]/…`).
**Performance Goals**: percibido — estructura del destino visible **al instante** en cada navegación; Salón desacoplado de la query más lenta de las 15.
**Constraints**: cero regresión de aislamiento multi-tenant; cero valor de plata provisional falso; sin promesas flotantes (unhandled rejection).
**Scale/Scope**: 8 `loading.tsx` + 1 `Skeleton` base + refactor de `operacion/page.tsx` y `local-shell.tsx` + 1 `ErrorBoundary` + doc + 2 archivos de test.

## Constitution Check

*GATE reforzado obligatorio — constitución §"Flujo de trabajo", casos **3 (display money-adjacent: caja/rendición)** y **4 (multi-tenancy)**.*

| Principio | Impacto | Cómo se respeta |
|---|---|---|
| I · Multi-tenancy estricto | Alto (se reestructuran las 15 queries) | Cada query conserva su `.eq("business_id", …)`. Los loaders viven **server-side** (mueven la query+transform tal cual, no se relajan filtros). La promesa resuelve datos ya scopeados; el cliente solo hace `use()`, no consulta. **FR-010**. Verify con rol real (no `service_role`) — **FR-008/SC-006**. |
| II · Test-First (dinero/estado/permisos) | Medio | F2 no cambia lógica de dinero (solo *display* + *timing*). Se testean: (a) predicados de counts puros (**FR-012**), (b) forma del `ActionResult` del piloto (**FR-014**). El resto es presentacional (verify en vivo). |
| III · Server Actions + Zod | Nulo | No se agregan mutaciones. F3 solo documenta/verifica una action existente. |
| IV · Dinero en centavos + TZ AR | Bajo | No se toca ningún cálculo de plata. La ventana "hoy" de counts/reservas sigue en `business.timezone` (`startOfTodayUtc`) — **FR-012**. |
| V · Secretos server-only | Nulo | No se exponen secretos; solo datos de operación ya visibles. |
| VI · Spec-Driven + approval gate | — | Este plan es el gate; spec ya validada (checklist en verde). |
| VII · Migraciones versionadas | Nulo | Sin migraciones (Key Entities: "no introduce entidades nuevas"). |

**Design/plan reforzado — decisión de arquitectura:** ver "Decisión clave" abajo.

## Decisión clave: cómo se streamea Operación

**Opciones consideradas**

- **A · Promise-passing + `use()` (elegida).** El server component crea 6 promesas (una por grupo de tab), sin `await`, y las pasa a `LocalShell`. Cada panel y **cada pill** leen su promesa con `use()` dentro de un `<Suspense>`; las tabs de plata además dentro de un `ErrorBoundary`.
  - ✅ **Una sola fuente** por grupo → la pill y el panel derivan del **mismo dato** ⇒ predicados idénticos "gratis" (**FR-012**) y **una sola query** por grupo (sin doble consulta).
  - ✅ El `business_id`-scoping queda **100% server-side** (los loaders son funciones server que mueven la query+transform actual sin tocar filtros).
  - ✅ Toda promesa la consume una pill **siempre montada** ⇒ no hay promesa flotante aunque la tab no se visite (**FR-011**).
  - ⚠️ Requiere un `ErrorBoundary` (no existe en el repo) y no hay precedente de `use()`-streaming ⇒ se mantiene **contenido** (una sola pantalla) y con error boundaries.
- **B · Server-component slots.** Cada tab como server component async dentro de `<Suspense>`, pasado como slot al client. Rechazada: para no bloquear el conteo habría que **duplicar** queries (count slot + panel slot) o perder la identidad de predicado; peor para FR-012 y eficiencia.
- **C · `await` de salón en la page + promesas para el resto.** Simplifica salón pero deja el diseño **no uniforme**; A es igual de simple y uniforme. Rechazada por consistencia.

**Invariantes de correctitud (traza a FR):**
- **FR-008/Edge redirect:** `ensureAdminAccess` + gate de rol se `await` **antes** de crear cualquier promesa; el `redirect()` ocurre en el server component, arriba del boundary.
- **FR-009:** N/A en `/operacion` (el gate de cobro vive en las rutas `cobrar/`; esas *no* se streamean acá — solo reciben `loading.tsx`, y su `iniciarCobro`/gate sigue corriendo en el server component antes de renderizar el client). No se difiere.
- **FR-006:** las pills muestran `—` (fallback de su `<Suspense>`) mientras la promesa está pendiente; nunca un `0` derivado de datos incompletos, porque el `0` solo se calcula **después** de resolver la promesa.
- **FR-007:** Caja y Rendición envuelven su panel en `ErrorBoundary` con copy accionable ("no se pudieron cargar los datos, reintentá") — nunca el estado vacío "no hay nada".
- **FR-012:** predicados centralizados en `operacion/counts.ts` (puros, testeados); la pill los usa sobre el dato ya resuelto.

## Project Structure

```text
specs/039-fundaciones-perf-percibida/
├── spec.md
├── plan.md            # este archivo
├── tasks.md
└── checklists/requirements.md
```

### Código afectado (repo)

```text
src/components/ui/skeleton.tsx                      # NEW · Skeleton base (FR-003)
src/components/shared/error-boundary.tsx            # NEW · ErrorBoundary de cliente (FR-007/011)
src/components/skeletons/mesa-route-skeleton.tsx    # NEW · skeletons de rutas de mesa (FR-002)
src/components/skeletons/operacion-skeleton.tsx     # NEW · skeleton del chrome + tabs (FR-002)
src/app/[business_slug]/mozo/loading.tsx                        # NEW (US1)
src/app/[business_slug]/mozo/mesa/[id]/pedir/loading.tsx        # NEW
src/app/[business_slug]/mozo/mesa/[id]/cuenta/loading.tsx       # NEW
src/app/[business_slug]/mozo/mesa/[id]/cobrar/loading.tsx       # NEW
src/app/[business_slug]/admin/(authed)/mesa/[id]/pedir/loading.tsx   # NEW
src/app/[business_slug]/admin/(authed)/mesa/[id]/cuenta/loading.tsx  # NEW
src/app/[business_slug]/admin/(authed)/mesa/[id]/cobrar/loading.tsx  # NEW
src/app/[business_slug]/admin/(authed)/operacion/loading.tsx        # NEW
src/app/[business_slug]/admin/(authed)/operacion/data.ts   # NEW · loaders server por grupo (FR-010)
src/app/[business_slug]/admin/(authed)/operacion/counts.ts # NEW · predicados puros de pills (FR-012)
src/app/[business_slug]/admin/(authed)/operacion/counts.test.ts # NEW · unit (FR-012)
src/app/[business_slug]/admin/(authed)/operacion/page.tsx  # MOD · auth+gate → promesas por grupo
src/components/admin/local/local-shell.tsx                 # MOD · use()+Suspense+ErrorBoundary por tab
src/lib/caja/rendicion-shape.test.ts               # NEW · forma del ActionResult del piloto (FR-014)
docs/conventions/action-returns-row.md             # NEW · doc de la convención (FR-013)
```

## Complexity Tracking

- **`use()`-streaming sin precedente en el repo:** mitigado manteniendo el cambio en **una** pantalla, con `ErrorBoundary` por tab de plata y verify en vivo con rol real. Los grupos de datos y transforms se mueven **tal cual** (sin tocar `business_id`), reduciendo el diff semántico a "cuándo" se resuelve, no "qué" se consulta.
- **`ErrorBoundary` nuevo:** clase mínima (React 19 sigue requiriendo class para `getDerivedStateFromError`), sin dependencia externa.
