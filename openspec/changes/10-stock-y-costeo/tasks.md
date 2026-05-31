# Tareas — 10-stock-y-costeo Stock extendido al bar, costo por producto, merma e import

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.
> Dinero en centavos, timezone AR, scope `business_id` + RLS. La última migración real es `0051`;
> usar placeholder `00NN_*` (el número definitivo se asigna al implementar).

## 1. Datos

- [ ] Migración `supabase/migrations/00NN_stock_bar_y_merma.sql`:
  - [ ] `alter table products add column is_bar_stock boolean not null default false;`
  - [ ] Índice parcial por `business_id` para listar stock de bar rápido.
  - [ ] (Sin tablas nuevas para merma: se reutiliza `ingredient_consumptions` de `0051`.)
- [ ] Verificar que las policies RLS `members_*`/`platform_*` de `stock_items`, `stock_movimientos` e
      `ingredient_consumptions` siguen cubriendo el scope `business_id` con la columna nueva.
- [ ] `pnpm db:types` → `src/lib/supabase/database.types.ts`.

## 2. Dominio (TDD)

### 2a. Stock de bar (alta/baja flexible)
- [ ] Test (rojo): extender `src/lib/stock/stock.integration.test.ts` — marcar/quitar `is_bar_stock`,
      baja lógica conserva `stock_movimientos`, doble descuento no ocurre (bebida vs. receta).
- [ ] Implementar en `src/lib/stock/actions.ts`: action para marcar/quitar stock de bar (reusa el patrón
      de `toggleTrackStock`; check de rol `admin`/`encargado`; validación Zod del input).
- [ ] Extender `src/lib/stock/queries.ts`: filtro `is_bar_stock` en `getStockOverview` /
      `getAllProductsForConfig` (o query nueva `getBarStockOverview`).

### 2b. Costo por producto
- [ ] Test (rojo): unidad sobre el cálculo de costeo por producto (margen en centavos, producto sin
      receta → `hasRecipe=false`, costo 0) — co-ubicado en `src/lib/ingredients/`.
- [ ] Reutilizar/exponer `getCosteoOverview` (`src/lib/ingredients/queries.ts`) para la pantalla de
      stock; no recalcular en cliente.

### 2c. Merma estimativa por período
- [ ] Test (rojo): lógica pura de merma (entró vs. salió + `waste_percent`) por insumo y rango de fechas,
      `src/lib/ingredients/<merma>.test.ts`.
- [ ] Implementar lógica pura en `src/lib/ingredients/<merma>.ts` y query server que agrega
      `ingredient_consumptions` por `created_at` en el rango (timezone AR vía `date-fns-tz`).

### 2d. Import masivo de insumos
- [ ] Test (rojo): validación Zod del lote + upsert idempotente + reporte OK/error sin abortar
      (co-ubicado en `src/lib/ingredients/`).
- [ ] Schema Zod del lote en `src/lib/ingredients/schema.ts` (nombre, unidad, presentación, `cost_cents`,
      waste, stock inicial).
- [ ] Server Action de import en `src/lib/ingredients/actions.ts` (check rol `admin`/`encargado`; upsert
      por `(business_id, name)`; devuelve resumen).

## 3. UI

- [ ] `src/components/admin/stock/`: vista "Stock de bar" (agregar/quitar flexible) en `stock-tab.tsx` /
      `stock-grid.tsx`.
- [ ] Columna de **costo por producto** (formateo con `src/lib/currency.ts`).
- [ ] Reporte de **merma por período** con selector de fechas.
- [ ] Importador de insumos (parsea Excel→filas en cliente; envía a la action).
- [ ] Cablear en `src/app/[business_slug]/admin/(authed)/stock/page.tsx` y `…/stock/configurar/`.

## 4. Verify

- [ ] `pnpm typecheck` y `pnpm test` en verde.
- [ ] Revisión fresca de archivos tocados.
- [ ] Marcar ✅ en `openspec/changes/README.md`.
