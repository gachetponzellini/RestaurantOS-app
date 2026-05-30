# Tareas — 08-caja-bar-venta-directa Caja de bar: venta directa + no manda a comanda

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.
> Dinero en centavos · scope business_id + RLS.

## 1. Datos
- [ ] Migración `supabase/migrations/00NN_caja_bar.sql`:
  - [ ] `alter table public.tables add column is_bar boolean not null default false`
        (mesa de barra; ortogonal a `status active/disabled`).
  - [ ] `alter table public.stations add column routes_to_comanda boolean not null default true`
        (sector que expide a comanda; bebidas/kiosco se marcan en `false`).
  - [ ] Índice parcial opcional `tables (floor_plan_id) where is_bar`.
  - [ ] RLS: reusa policies existentes de `tables` (vía `floor_plans`) y `stations`; verificar que
        cubren el scope `business_id` (no hace falta policy nueva).
- [ ] `pnpm db:types` → `src/lib/supabase/database.types.ts`.

## 2. Dominio (TDD)
- [ ] Test (rojo): `src/lib/comandas/bar-routing.test.ts`:
      `itemGeneraComanda({ tableIsBar, stationExpide })` → bar + no expide ⇒ false; bar + expide ⇒
      true; no bar ⇒ true (comportamiento de salón).
- [ ] Implementar pura `src/lib/comandas/bar-routing.ts` (sin DB). `routing.ts` y `route-items.ts`
      quedan **sin cambios**.
- [ ] Verificar que `src/lib/comandas/routing.test.ts` (existente) sigue verde (no regresión).
- [ ] Ajustar `enviarComanda` (`src/lib/comandas/actions.ts`): al construir `itemsByStation`, si la
      orden es de mesa de bar, excluir items de sectores con `routes_to_comanda = false` usando
      `itemGeneraComanda`. Traer `is_bar` de la mesa y `routes_to_comanda` del station resuelto.
- [ ] Acciones de barra (donde corresponda, p. ej. `src/lib/comandas/actions.ts` o
      `src/lib/mozo/actions.ts`): abrir/cerrar rápido la mesa de bar (reusa transiciones
      `libre↔ocupada`); cobro reusa `src/lib/billing/cobro-actions.ts` (`registrarPago`).
- [ ] `src/lib/catalog/station-actions.ts`: acción para setear `routes_to_comanda` (Zod + scope
      `business_id` + `canManageCajas`/admin).

## 3. UI
- [ ] Componente "Caja de bar / venta directa" en `src/components/admin/local/`: abrir mesa de bar,
      cargar productos, cobrar; muestra qué items salieron a comanda (sólo sectores que expiden).
- [ ] Toggle "expide a comanda" en la administración de sectores (consume `station-actions.ts`).

## 4. Verify
- [ ] `pnpm typecheck` y `pnpm test` en verde (incluido `routing.test.ts` sin regresión).
- [ ] Revisión fresca: el salón normal rutea igual que antes; sólo la barra aplica la excepción.
- [ ] Marcar ✅ en `openspec/changes/README.md`.
