# 10-stock-y-costeo — Stock extendido al bar, costo por producto, merma estimativa e import de insumos

> Estado: 📋 propuesto · Origen: Reunión §4 (Panel / Administración · Stock) · §7.13 (Productos, insumos, costeo y stock) · §3.1 (importar insumos) · Design: no

## Por qué

El stock hoy cubre dos mundos separados: **bebidas/productos contables** (toggle `track_stock` sobre
`products` + tablas `stock_items`/`stock_movimientos`, migración `0049`) y **stock de cocina por
insumo** con recetas/sub-recetas y descargo automático (`ingredients`, `recipes`,
`ingredient_recipes`, `ingredient_consumptions`, migraciones `0050`/`0051`). En la reunión (§7.13 y §4)
el cliente pidió cuatro cosas concretas sobre esa base:

1. **Extender el stock al bar** (alfajores, etc.), pudiendo **agregar/quitar productos del stock de
   forma flexible** — no precargar listas enormes porque el surtido varía por temporada.
2. **Costeo por producto** (ej. milanesa napolitana = queso + milanesa + …). La lógica de costeo ya
   existe (`getCosteoOverview` en `src/lib/ingredients/queries.ts`, helper SQL
   `fn_ingredient_cost_per_unit` en `0051`), pero **no está expuesta como dato por producto** en la
   gestión de stock/catálogo; falta el delta de presentación.
3. **Merma estimativa/flexible, casi un reporte** (ej. el entrecote tiene merma aproximada; se calcula
   contra lo que entró vs. lo que salió). Hoy hay `waste_percent` por insumo y `ingredient_consumptions`
   (kind `venta`/`merma`/`ajuste`/`compra`), pero falta un reporte que cruce **entradas vs. salidas**
   y exponga merma por período.
4. **Importar insumos desde el Excel de MaxiRest** (carga masiva) — hoy los insumos se cargan uno por
   uno desde `src/lib/ingredients/actions.ts`.

La decisión está tomada (§6 / §7.13): es un **refinamiento sobre los módulos existentes**, no un módulo
nuevo. Se reutiliza el modelo de `0049`/`0050`/`0051` y se agregan: marca de producto de bar, exposición
del costeo por producto, un reporte de merma por período y una action de import masivo.

## Qué cambia

- **Stock de bar como subconjunto flexible de `stock_items`**: un producto de bar es un `product` con
  `track_stock = true` ya soportado por `0049`; se agrega una marca `is_bar_stock` (o categoría/flag)
  para **filtrar y listar** el stock de barra aparte del de bebidas, y para que la UI permita
  **agregar/quitar** un producto del stock de bar sin tocar listas globales (alta puntual + baja lógica
  vía `track_stock = false` sin perder histórico).
- **Costo por producto expuesto en stock/catálogo**: nueva query que devuelve, por producto con receta,
  el `foodCostCents` y el `marginPercent` ya calculados por `getCosteoOverview`, consumibles desde la
  pantalla de stock/costeo (no recalcular en cliente; centavos siempre).
- **Reporte de merma por período**: nueva query pura+server que, a partir de `ingredient_consumptions`
  (entradas `kind='compra'` vs. salidas `kind='venta'/'merma'/'ajuste'`) y `waste_percent`, expone por
  insumo y rango de fechas (timezone AR): entró, salió, merma estimada y diferencia. Es **estimativo**
  (lo aclara la reunión), presentado como reporte filtrable por período.
- **Import masivo de insumos desde Excel/CSV de MaxiRest**: nueva Server Action que valida con Zod un
  lote de filas (nombre, unidad, presentación, costo en centavos, waste, stock inicial) y hace upsert
  por `(business_id, name)` reutilizando el modelo de `0050`, reportando filas OK y filas con error.

## Alcance

**Incluye:**
- Marca/flag para identificar **productos de stock de bar** sobre `products`/`stock_items` y su
  filtrado en queries y UI.
- Alta puntual y **baja flexible** (sin precargar listas) de productos del stock de bar.
- Query de **costo por producto** apoyada en el costeo existente, expuesta en la pantalla de stock.
- Query/reporte de **merma estimativa por período** (entró vs. salió) sobre `ingredient_consumptions`.
- Server Action de **import masivo de insumos** (parseo del Excel→filas se hace en cliente; la action
  recibe filas ya parseadas y validadas con Zod).

**No incluye (fuera de alcance):**
- **Caja de bar / venta directa sin mozo**: vive en el cambio **08 (caja-bar-venta-directa)**. Acá sólo
  se modela el *stock* de los productos que la barra vende.
- **Proveedores e import de proveedores**: cambio **12 (proveedores)**. Acá sólo insumos.
- **Cruce proveedor↔salida de productos** y analítica a medida: cambios **12** y **16**.
- Rediseñar el motor de descargo (triggers `fn_recipe_stock_descuento`/`fn_recipe_stock_reversion` de
  `0050`/`0051`) — se reutiliza tal cual.
- Parseo del archivo Excel binario en el server (XLSX): se asume conversión a filas/CSV en el cliente;
  la action es agnóstica al formato de origen.

## Impacto

- **Archivos** (reales):
  - `src/lib/stock/actions.ts` (alta/baja flexible de stock de bar; ya tiene `toggleTrackStock`,
    `setStockLevels`, `ingresarStock`, `ajustarStock`).
  - `src/lib/stock/queries.ts` (filtro de stock de bar; ya tiene `getStockOverview`,
    `getAllProductsForConfig`).
  - `src/lib/ingredients/queries.ts` (costeo por producto: `getCosteoOverview`; merma:
    `getConsumptionSummary`, `getIngredientConsumptions` — se agrega un reporte entró-vs-salió).
  - `src/lib/ingredients/actions.ts` + `src/lib/ingredients/schema.ts` (Server Action + Zod de import
    masivo).
  - `src/lib/ingredients/` lógica pura nueva para el cálculo de merma estimativa por período (testeable).
  - `src/components/admin/stock/` (`stock-tab.tsx`, `stock-grid.tsx`, `stock-cocina-tab.tsx`,
    `stock-config-client.tsx`): vista de stock de bar, columna de costo por producto, reporte de merma,
    importador.
  - `src/app/[business_slug]/admin/(authed)/stock/page.tsx` y `…/stock/configurar/`.
- **Datos:** nueva migración `supabase/migrations/00NN_stock_bar_y_merma.sql` (el número definitivo se
  asigna al implementar; la última migración real es `0051`). Agrega marca de **stock de bar** sobre
  `products` (ej. `is_bar_stock boolean not null default false`) o sobre `stock_items`, con su índice
  por `business_id`. **No** crea tablas para merma: reutiliza `ingredient_consumptions` (`0051`). RLS:
  las policies `members_*`/`platform_*` de `stock_items`/`stock_movimientos`/`ingredient_consumptions`
  ya cubren el scope `business_id`; sólo se ajusta lo que toque la columna nueva.
- **Tipos:** regenerar `pnpm db:types` → `src/lib/supabase/database.types.ts`.
- **Permisos:** sin helpers nuevos en `src/lib/permissions/can.ts`. La gestión de stock ya exige
  `admin`/`encargado` dentro de las actions (`requireMozoActionContext` + check de rol en
  `src/lib/stock/actions.ts`); el import masivo aplica el mismo check.
- **Integraciones:** n/a.

## Riesgos

- **Doble descuento de stock** (bebida con `track_stock` que además tiene receta) → ya está resuelto en
  `0050`/`0051`: `fn_recipe_stock_descuento` hace *skip* si el producto tiene `track_stock = true`. El
  stock de bar usa la rama `track_stock` (bebidas), no recetas, así que no se duplica. Cubrir con el
  test de integración existente `src/lib/stock/stock.integration.test.ts`.
- **Merma "exacta" vs. estimativa** → la reunión es explícita en que es **estimativa**; se documenta en
  la UI como reporte aproximado (entró vs. salió + waste), no como inventario contable. Evita expectativa
  de cuadre perfecto.
- **Import masivo rompiendo unicidad** `(business_id, name)` → la action hace **upsert** idempotente y
  devuelve filas con error sin abortar el lote; se valida unidad/costo con Zod antes de escribir.
- **Centavos** → costo e import en `*_cents` enteros; la UI formatea con `src/lib/currency.ts`. Nunca
  floats para dinero.
- **No romper el stock de cocina** → el flag de bar es ortogonal a `ingredients`/`recipes`; las queries
  de cocina (`getKitchenStockOverview`) no se tocan.

## Preguntas abiertas

- [ ] ¿El "stock de bar" se marca a nivel **producto** (`products.is_bar_stock`) o se infiere por
      **categoría/sector** (ej. categoría "Kiosco"/"Bar")? Propuesta: flag explícito por producto, para
      máxima flexibilidad temporada a temporada (lo pidió así la reunión).
- [ ] ¿"Quitar del stock" debe **borrar** el `stock_item` o sólo **desactivar** (`track_stock = false`)
      conservando histórico de `stock_movimientos`? Propuesta: desactivar (no perder trazabilidad).
- [ ] El Excel de MaxiRest: ¿qué columnas trae exactamente (nombre, unidad, costo, presentación)? Se
      necesita una muestra para fijar el mapeo de columnas del importador.
- [ ] Merma: ¿el período por defecto es turno, día o mes? Propuesta: rango libre de fechas con default
      al mes en curso (timezone AR).
