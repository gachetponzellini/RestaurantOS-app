# Plan de implementación — 052 KDS refetch acotado

## Enfoque

Homogeneizar el kanban hacia el patrón `orders-realtime-board.tsx` ("merge local, cero refresh"), pero refetcheando la **lista** de comandas (no por-id) porque:
- el volumen es chico (~40 comandas) → una query de lista es barata;
- el payload crudo del realtime no trae los JOINs (order_number, table_label, items, modifiers), así que un merge desde el payload sería insuficiente — hace falta refetch enriquecido de todos modos;
- reusar `getActiveComandas` evita duplicar el `select` + mapeo (ya testeado) y el manejo de timezone/día operativo.

Transporte: **Server Action** (no query directa desde el browser) para reusar `getActiveComandas` verbatim (DRY, timezone server-side, RawRow mapping intacto). Sigue eliminando el re-fetch de las 6 tabs: baja a 2 queries.

## Cambios

1. **`src/lib/comandas/actions.ts`** — nueva `getActiveComandasForKanban(slug): Promise<ActionResult<LocalComanda[]>>`:
   `getBusiness(slug)` → chequeo de sesión (`getUser`) → `getActiveComandas(business.id, business.timezone)` → `actionOk`.
2. **`src/components/admin/local/comandas-kanban.tsx`**:
   - `baseComandas` en `useState(initialComandas)` + `useEffect` de re-sync si cambia el prop.
   - `refetchComandas` (`useCallback([slug])`) con guard de secuencia `refetchSeq` → `setBaseComandas`.
   - `useOptimisticAction(baseComandas, …)` (antes: `initialComandas`).
   - Handler realtime: `scheduleRefresh` (debounce 200 ms) llama `void refetchComandas()` (antes `router.refresh()`); dep del effect `[refetchComandas]`.
   - Modales Anular/Editar `onDone`: `void refetchComandas()` (antes `router.refresh()`).
   - Se elimina `useRouter`/`router` (queda sin uso).

## Verificación

- `pnpm typecheck` — verde.
- `pnpm lint` — sin nuevos problemas en los 2 archivos (baseline del repo es ruidosa pero ajena).
- `pnpm test` — 720 verdes.
- `pnpm build` — verde.
- Revisión adversarial multi-lente (concurrencia / optimismo / multi-tenant / regresión).
- **Pendiente**: verificar en vivo con rol real (encargado/admin) — no ejecutable headless.

## Riesgos y mitigaciones

- **Race de refetch** → guard de secuencia (`refetchSeq`).
- **Prop pisando realtime** → el prop es referencialmente estable (`use(promise)`); el re-sync sólo dispara si cambia de verdad.
- **Otras tabs stale** → cada tab tiene su propio realtime (Salón: `use-tables-realtime`; Pedidos: `orders-realtime-board`); no dependían del `router.refresh()` del kanban.
- **Fuga cross-tenant** → filtro `business_id` + RLS en `getActiveComandas` (sin cambios).
