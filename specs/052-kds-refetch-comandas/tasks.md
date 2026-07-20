# Tasks — 052 KDS refetch acotado

- [x] **T001** Verificar volumen de comandas + índices en cloud (no es la query SQL). *(39 comandas, `comandas_station_status_idx` OK)*
- [x] **T002** Verificar RLS de comandas + árbol anidado para `is_business_member` (refetch server-client factible).
- [x] **T003** `getComandasTabData(slug)` en `src/lib/comandas/actions.ts` (reusa las 4 queries de `loadComandas`).
- [x] **T004** Estado único `serverData` (seed de props) + `refetchComandas` con guard `refetchSeq` + try/catch.
- [x] **T005** Swap de los 2 `router.refresh()` del handler realtime → `void refetchComandas()`; dep `[refetchComandas]`.
- [x] **T006** Swap de los 2 `router.refresh()` de los modales Anular/Editar → `void refetchComandas()`.
- [x] **T007** Eliminar `useRouter`/`router` sin uso; `useCallback` importado.
- [x] **T008** `pnpm typecheck` + `pnpm test` + `pnpm build` en verde; lint sin nuevos problemas.
- [x] **T009** Revisión adversarial multi-lente **ronda 1** (concurrencia / optimismo / multi-tenant / regresión) → 4 hallazgos confirmados.
- [x] **T010** Fix ronda 1: (#1) `serverData` de un solo escritor (elimina el `useEffect` de prop-sync); (#2+#4) el refetch trae stations+mozos+heartbeat; (#3) `onReimprimir` espera el refetch en su transición.
- [x] **T011** Revisión adversarial **ronda 2** (sobre los fixes) → 4 previos OK, pero **2 bugs nuevos**: fuga cross-tenant de nómina (service-role sin gate) + regresión de frescura al volver a la tab.
- [x] **T012** Fix ronda 2: (#seg) gate `requireMozoActionContext` en `getComandasTabData` + **test** (`get-comandas-tab-data.test.ts`, 3 casos); (#frescura) refetch al montar.
- [x] **T013** Verify final: `pnpm typecheck` + `pnpm test` (723) + `pnpm build` en verde.
- [ ] **T014** Verificar en vivo con **rol real** (encargado/admin): evento de comanda desde otro dispositivo se refleja sin refresh de ruta; red muestra sólo las 4 queries de la tab; pill del agente no da falso "sin conexión". *(no ejecutable headless — issue #78 abierta hasta acá)*
