# Feature Specification: KDS — refetch acotado de comandas (sin `router.refresh`)

**Feature Branch**: `052-kds-refetch-comandas`

**Created**: 2026-07-20

**Status**: 🟡 Implementada (2026-07-20) — typecheck/test(723)/build en verde, 2 rondas de review adversarial (4 hallazgos ronda 1 + 2 bugs de la propia ronda de fixes, todos corregidos; gate de seguridad con test). Pendiente **verificar en vivo con rol real** (encargado/admin). Issue [#78](https://github.com/gachetponzellini/RestaurantOS-app/issues/78).

**Input**: Iniciativa de perf percibida — [wiki/analyses/perf-percibida-operacion-mozo.md](../../../../wiki/analyses/perf-percibida-operacion-mozo.md). **Fase 3 parcial** (tab Comandas). Continúa [spec 039](../039-fundaciones-perf-percibida/spec.md) y [spec 041](../041-mozo-instantaneo/spec.md).

## Contexto y problema

La pantalla de **Comandas** (KDS, kanban en `src/components/admin/local/comandas-kanban.tsx`) se siente lenta durante la operación. El costo **no** es la query SQL —volumen chico (~40 comandas), índices OK (`comandas_station_status_idx`)— sino el **refresh de ruta completo** en cada evento de realtime.

El kanban se suscribe a la tabla `comandas` (INSERT/UPDATE/DELETE) y a `orders` (UPDATE, para el relabel de mesa) y en cada evento dispara `router.refresh()`. Como `operacion/page.tsx` crea las **6 promesas de loaders sin condición** (Salón —la más pesada: floor plans + dine-in con comandas anidadas + reservas + mozos—, comandas, pedidos, caja, rendición, fichaje), `router.refresh()` **re-ejecuta las 6** en cada cambio de cocina. En hora pico las comandas cambian constantemente → round-trip + re-fetch de ~15 queries + reconciliación de todo el árbol RSC, una y otra vez.

La [spec 039](../039-fundaciones-perf-percibida/spec.md) partió los loaders en promesas separadas, pero eso sólo ayuda al **streaming del primer render**: `router.refresh()` igual las re-crea y re-corre las 6.

El estándar a replicar **ya existe** en el repo: `orders-realtime-board.tsx` hace **merge local, cero refresh** (ante un evento fetchea sólo la fila afectada y la mergea en el estado). Esta spec homogeneiza el kanban hacia ese patrón.

Esta spec **no toca plata ni ruteo a cocina**: es un refetch de lectura de comandas + merge en estado local. El optimismo de las acciones propias (empezar/entregar/reimprimir) sigue con `useOptimisticAction` (regla dura [spec 21](../../src/lib/ui/use-optimistic-action.ts)).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El KDS se actualiza sin recargar toda la operación (Priority: P1)

Cuando otra estación/dispositivo cambia una comanda (nueva, empezada, entregada, anulada), el KDS del encargado debe reflejarlo sin re-ejecutar Salón/Caja/Rendición/Fichaje/Pedidos ni hacer un round-trip de ruta completo.

**Why this priority**: Es el cuello de botella percibido de la tab Comandas en hora pico; cada evento de cocina hoy re-fetchea las 6 tabs.

**Independent Test**: Con el KDS abierto, generar un cambio de comanda desde otro dispositivo y ver la card actualizarse **sin** el parpadeo/latencia del refresh completo; en la red sólo se observan las 2 queries de comandas, no las de Salón/Caja/etc.

**Acceptance Scenarios**:

1. **Dado** un evento de realtime en `comandas`, **Cuando** llega, **Entonces** el kanban re-fetchea **sólo** las comandas del día (`getActiveComandasForKanban`) y mergea el resultado en el estado local, **sin** `router.refresh()`.
2. **Dado** una orden multi-sector que dispara N INSERTs en `comandas`, **Cuando** llegan en ráfaga, **Entonces** el debounce (200 ms) los coalesce en **un** refetch.
3. **Dado** un traslado de mesa (spec 048, sólo toca `orders.table_id`), **Cuando** llega el UPDATE de `orders`, **Entonces** el refetch re-deriva el `table_label` vía el JOIN y la card muestra la mesa nueva.
4. **Dado** que anulo o edito una comanda desde su modal, **Cuando** la action termina (`onDone`), **Entonces** el kanban refleja el cambio vía el mismo refetch acotado (no `router.refresh()`).

### Edge Cases

- **Respuestas fuera de orden**: dos refetch en vuelo no pueden dejar el KDS con datos viejos → **guard de secuencia** (`refetchSeq`): sólo se aplica el resultado del refetch más nuevo.
- **Error del refetch** (`res.ok === false` o throw): el KDS **mantiene** el estado actual, nunca se vacía (es un refresh de fondo, no una acción del usuario).
- **Acción propia en vuelo**: si llega un refetch mientras hay una transición de `run()` (empezar/entregar), el overlay optimista **persiste** hasta que su transición termina (semántica de `useOptimistic`), sin flash ni rollback espurio — igual que cuando la base venía del prop del server.
- **Evento de otro negocio**: el canal escucha toda la tabla `comandas` (no tiene `business_id` directo); un evento de otro negocio dispara un refetch que igual devuelve **sólo** las del negocio del `slug` (filtro `business_id` + RLS `is_business_member`). Correcto, con costo de un refetch de más (aceptable).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001 (ADDED)**: El sistema MUST exponer una Server Action `getComandasTabData(slug)` que devuelva **toda** la data server de la tab (`ActionResult<ComandasTabData>` = comandas del día + stations + mozos + `printAgentLastSeenAt`) — las **4 queries** que ya corría `loadComandas`, **no** los otros 5 loaders de la ruta. (Trae las 4, no sólo comandas, para no congelar el pill de salud del agente ni los nombres de mozo / sectores nuevos entre turnos — todo eso lo refrescaba el `router.refresh()` que se elimina.)
- **FR-002 (MODIFIED)**: Ante un evento de realtime (`comandas` * / `orders` UPDATE), el kanban MUST re-fetchear vía FR-001 y mergear en estado local, **en lugar** de `router.refresh()`. *(Antes: todo evento hacía `router.refresh()` → re-ejecutaba las 6 promesas de loaders.)*
- **FR-003**: Los refetch por realtime MUST estar **debounced** (200 ms) para coalescer ráfagas multi-sector.
- **FR-004**: Los refetch MUST tener **guard de carrera** (secuencia monotónica): sólo el resultado del refetch más nuevo se aplica al estado.
- **FR-005 (MODIFIED)**: Los `onDone` de los modales **Anular** y **Editar** comanda MUST usar el mismo refetch acotado en lugar de `router.refresh()`.
- **FR-006**: El estado optimista (`useOptimisticAction`) MUST driverse desde un **único** estado local `serverData` (seed = props, escrito **sólo** por el refetch), preservando el overlay optimista de las acciones propias sin flash. Un solo escritor → sin carrera contra un re-sync de prop.
- **FR-007 (ADDED)**: El kanban MUST re-fetchear **al montar** (incluido el regreso a la tab, que remonta el panel): la promesa RSC de `initialComandas` queda congelada al page-load al no haber ya `router.refresh()`, así que sin esto un regreso mostraría el snapshot viejo hasta el próximo evento.
- **FR-008 (ADDED)**: `onReimprimir` (acción infrecuente) MUST esperar el refetch **dentro de su transición** para que el overlay optimista caiga sobre base ya-persistida (sin flicker del botón). El refetch nunca lanza → no dispara rollback/toast.

**Invariantes de correctitud (no negociables)**

- **FR-009**: **Gate de membresía** — `getComandasTabData` MUST exigir `requireMozoActionContext(business.id)` (mismo gate que las demás actions del KDS) antes de correr las queries. Crítico: `getMozosByBusiness` corre con **service-role (RLS bypass)**; sin el gate, un autenticado ajeno al negocio leería la nómina del staff (nombres + emails) pasando un slug foráneo.
- **FR-010**: Multi-tenant — el refetch MUST devolver **sólo** data del negocio del `slug` (filtro `business_id` + RLS + el gate de FR-009), aun para un usuario miembro de varios negocios (House/Golf comparten socios).
- **FR-011**: El cambio **no** introduce optimismo de plata ni de ruteo a cocina; es lectura + merge (spec 21 intacta).

### Non-Goals (fuera de alcance)

- Merge **por-comanda** desde el payload del realtime (como `orders-realtime-board` con `fetchOrder`): acá se refetchea la lista completa de comandas (barato al volumen actual). Optimización futura si el volumen lo pidiera.
- Filtro server-side del canal por negocio (imposible: `comandas` no tiene `business_id`); se acepta un refetch de más ante eventos de otro negocio.
- Caja / rendición / resto de la fase 3 (siguen con su propio patrón).

### Key Entities

Sin entidades ni migraciones nuevas. Reusa `LocalComanda` y `getActiveComandas` existentes.

## Success Criteria *(mandatory)*

- **SC-001**: Un cambio de comanda desde otro dispositivo se refleja en el KDS sin el parpadeo/latencia del refresh de ruta completo.
- **SC-002**: Por evento de cocina la red muestra **sólo** las 4 queries de la tab Comandas, no las de Salón/Caja/Rendición/Fichaje/Pedidos (5 loaders + re-render RSC evitados).
- **SC-003**: Ninguna secuencia de refetch concurrentes deja el KDS con datos viejos (guard de secuencia); un error de refetch nunca vacía el kanban.
- **SC-004**: Cero regresión en el optimismo de empezar/entregar/reimprimir ni en los modales Anular/Editar; el pill de salud del agente y los nombres de mozo/sectores se mantienen frescos; volver a la tab muestra el estado actual (no un snapshot viejo).
- **SC-005**: `pnpm typecheck` + `pnpm test` + `pnpm build` en verde. Verificación en vivo con **rol real** (encargado/admin).
- **SC-006**: Cero fuga cross-tenant: un no-miembro que invoque `getComandasTabData` con un slug foráneo recibe error y **no** se corre ninguna query (incluida la nómina service-role). Cubierto por test (`get-comandas-tab-data.test.ts`).

## Assumptions

- RLS de `comandas`/`comanda_items`/`order_items`/`order_item_modifiers`/`stations`/`tables` permite a un `is_business_member` leer el árbol (verificado en cloud, 2026-07-20).
- `getActiveComandas` ya corre con el server client (RLS) + filtro `business_id` — la action sólo agrega resolución de `slug`→business + chequeo de sesión.
- El prop `initialComandas` es referencialmente estable entre re-renders (viene de `use(promise)` en `LocalShell`).
- Dependencia: continúa las specs [039](../039-fundaciones-perf-percibida/spec.md) y [041](../041-mozo-instantaneo/spec.md).
