# 16-campanas-y-analitica — Completar campañas (redención) y analítica filtrable por período, sin propina

> Estado: 📋 propuesto · Origen: Reunión §3.1 (Accionables · equipo dev) · §7.17 (Analítica completa) · §4 (Analítica) · §7.12 (Panel) · §7.20 (Proveedores↔salida) · Design: no

## Por qué

La reunión pidió cerrar **Campañas** y un set de ajustes de **Analítica** (§4, §7.17). Al aterrizar en el
código, el estado real es más avanzado que el backlog sugería, así que este cambio define el **delta honesto**:

1. **Campañas ya existe y casi completa**: hay migración (`0019`: `campaigns`, `campaign_messages` y un
   **trigger de redención** que marca `redeemed_at` cuando una orden usa el promo personal), tipos
   (`src/lib/campaigns/types.ts`), helpers (`template.ts`, `channels.ts`), Server Actions
   (`src/lib/admin/campaigns-actions.ts`: `createCampaign`/`launchCampaign`/`cancelCampaign`/`deleteCampaign`/
   `markCampaignMessageSent`), queries (`src/lib/admin/campaigns-query.ts`) y UI con rutas
   (`src/app/[business_slug]/admin/(authed)/campanas/...`, `src/components/admin/campaigns/*`). El canal
   **manual** (wa.me, `buildWaMeLink`) está vivo; **WABA** es un stub (`channels.ts:wabaChannel`). El delta
   es de **completitud y consistencia**, no greenfield: cerrar el ciclo de **redención visible**, alinear
   permisos y dejar el reporte de redención dentro del nuevo filtro por período.
2. **Analítica NO es filtrable por rango libre** (esto es **fundamental**, §4/§7.17: "merma y métricas
   editables/filtrables por período de tiempo"). Hoy `getReportData` (`src/lib/admin/reports-query.ts`) toma
   un **preset cerrado** `ReportRange = today | yesterday | 7d | 30d` y el selector
   (`src/components/admin/reports/range-selector.tsx`) sólo ofrece esos cuatro. Falta **desde/hasta** con
   timezone AR. Las queries "extra" (`reports-extra-query.ts`, `profit-query.ts`) **ya** reciben
   `startIso/endIso`, así que el cambio principal es del lado de `getReportData`, el selector y el page.
3. **La propina contamina las métricas** (regla transversal §6, project.md §6: "propina por fuera de las
   métricas"). Hoy `billing/totals.ts` calcula `total = subtotal − descuento + propina`, así que
   `orders.total_cents` **incluye propina**, y esa columna es la base de ingresos en
   `reports-query.ts`/`dashboard-query.ts`. Además el dashboard expone propina explícita
   (`dashboard-query.ts`: `getTipsToday`, `getPaymentMix().tipsCents`, `PaymentMix.tipsCents`). Hay que
   **sacar la propina** de las métricas/paneles.
4. **Estadísticas a medida** a pedido (§7.17, §7.20): la **relación proveedor ↔ salida de productos** (la
   pidió Tommy). El vínculo de datos y la query base los provee el cambio **12** (`supplier_ingredients`,
   cruce con `ingredient_consumptions`); acá se **consume** ese cruce como un reporte filtrable por período.

Métricas que la reunión nombró y **ya existen** (se confirman en alcance, no se reconstruyen): popularidad
por **rentabilidad** (`profit-query.ts:getMenuEngineering` con cuadrantes estrella/vaca/puzzle/perro),
**redención de campañas** (`reports-extra-query.ts:getMarketingSummary.redemptionRatePct`) y **% facturado
sobre ventas** (`getFiscalSummary.invoicedRatePct`). El trabajo es que **respeten el período libre** y que
la base de ventas **no incluya propina**.

## Qué cambia

- **Analítica filtrable por rango libre (desde/hasta)**: `getReportData` acepta un **rango custom** además
  de los presets; el `range-selector` suma "Personalizado" con date-pickers (timezone AR); el page de
  reportes propaga `start`/`end` a **todas** las queries (las extra ya lo soportan). La **merma** ya viene
  de `profit-query.ts:getProfitMetrics().mermaCents` por `startIso/endIso` — queda cubierta por el mismo
  filtro.
- **Propina fuera de las métricas**: las métricas de ventas/ingresos dejan de incluir propina. Como la
  composición del total la corrige el cambio **06** (excluir propina del facturable), acá se asegura el
  **lado analítica/presentación**: la base de ingresos refleja **ventas sin propina** y se **quitan** las
  tarjetas de propina del dashboard (`getTipsToday`, `tipsCents` en paneles). La propina, si se quiere ver,
  vive sólo en el contexto de caja/cobro, no en analítica.
- **Campañas — completar el ciclo**: dejar visible y consistente la **redención** por campaña
  (cuántos códigos personales se canjearon, monto asociado), alinear **permisos** del módulo y exponer el
  reporte de redención dentro del filtro por período. (El alta/lanzamiento/marcado ya existen; no se
  rehacen.)
- **Reporte a medida proveedor ↔ salida de productos**: consumir la query base del cambio **12**
  (proveedor → insumo → `ingredient_consumptions` con `kind='venta'`) como una sección de analítica
  filtrable por período (estimativa, como la merma).

## Alcance

**Incluye:**
- **Rango de fechas libre** en analítica: tipo de rango custom + `getReportData` + `range-selector` +
  `reportes/page.tsx`, con timezone AR (`date-fns-tz`).
- **Sacar la propina** de las métricas: base de ventas sin propina en `reports-query.ts` y
  `dashboard-query.ts`; **remover** las superficies de propina del dashboard (`getTipsToday`,
  `getPaymentMix().tipsCents` en paneles de métricas).
- **Redención de campañas** visible y consistente por campaña + dentro del filtro por período (apoyado en el
  trigger de `0019` y en `getMarketingSummary`).
- **Reporte proveedor ↔ salida de productos** (consumiendo la query base del cambio 12), filtrable por
  período.
- Confirmación de que **popularidad por rentabilidad** y **% facturado sobre ventas** respetan el rango libre.

**No incluye (fuera de alcance):**
- **Rehacer el módulo de Campañas** (alta/lanzamiento/dispatch/marcado): ya existe en
  `src/lib/admin/campaigns-actions.ts` + UI. Sólo se completa redención/permisos/consistencia.
- **Conectar WABA / cuenta de Meta** para envío automático de campañas: stub hoy (`channels.ts`); el
  cableado de Meta es del cambio **14**. El canal manual (wa.me) sigue siendo el productivo.
- **Cambiar la composición del total / cómo se cobra la propina**: es el cambio **06** (excluir propina del
  facturable y del esperado de caja). Acá sólo el **lado métricas/presentación**.
- **El modelo de datos proveedor↔insumo y su query base**: lo crea el cambio **12** (`supplier_ingredients`,
  `getSupplierProductOutflow`). Acá sólo se **consume**.
- **Costeo/recetas**: ya existe (`0050`/`0051`, `profit-query.ts`); no se toca.

## Impacto

- **Archivos** (reales):
  - `src/lib/admin/reports-query.ts` — aceptar rango custom (`{start,end}`) además de `ReportRange`;
    `computeRange`/`getReportData` y la base de ingresos **sin propina**.
  - `src/lib/admin/dashboard-query.ts` — base de ingresos sin propina; **remover** `getTipsToday` y el
    `tipsCents` de `getPaymentMix`/`PaymentMix` de los paneles de métricas (o dejar de exponerlos en UI).
  - `src/lib/admin/reports-extra-query.ts` (`getFiscalSummary`, `getMarketingSummary`, `getStationTimings`)
    y `src/lib/admin/profit-query.ts` (`getMenuEngineering`, `getProfitMetrics`) — ya toman `startIso/endIso`;
    se verifican contra el rango libre (cambios mínimos o nulos).
  - `src/components/admin/reports/range-selector.tsx` — opción "Personalizado" con date-pickers (AR).
  - `src/app/[business_slug]/admin/(authed)/reportes/page.tsx` — parsear `start`/`end` de `searchParams` y
    propagarlos a todas las queries.
  - `src/components/admin/reports/*` (`revenue-chart`, `summary-cards`, `marketing-summary`,
    `menu-engineering`, `fiscal-summary`, …) — consumir el rango libre; **quitar** cualquier render de propina.
  - `src/lib/admin/campaigns-actions.ts` / `campaigns-query.ts` + `src/components/admin/campaigns/*` —
    completitud de redención + alineación de permisos (ver pregunta abierta).
  - Reporte proveedor↔salida: sección nueva en `src/components/admin/reports/*` que consume la query base
    del cambio 12 (`src/lib/proveedores/queries.ts:getSupplierProductOutflow`).
- **Datos:** **sin migración nueva propia** esperada (campañas usa `0019`; analítica lee `orders`/`payments`/
  `invoices`/`ingredient_consumptions`/`campaigns` existentes; proveedor↔salida lo crea el cambio 12). Si la
  decisión de propina exige una columna derivada de ventas sin propina, se evaluará en tasks; la fuente de
  verdad de la composición es el cambio 06. Número de migración (si hiciera falta) = placeholder `00NN_*`
  (última real `0051`).
- **Tipos:** regenerar `pnpm db:types` sólo si el cambio 06/12 alteró el schema; en este cambio, n/a salvo
  consumo.
- **Permisos:** ver reportes → roles que ya acceden al panel; gestionar campañas → hoy `admin` (en
  `campaigns-actions.ts:assertCanManage`). Evaluar incluir `encargado` (consistencia con otros módulos) en
  `src/lib/permissions/can.ts` — pregunta abierta.
- **Integraciones:** lee **AFIP** (`invoices`, `0048`) para % facturado; **Campañas** (`0019`) para redención;
  **costeo** (`0050/0051`) para rentabilidad/merma; **Proveedores** (cambio 12) para el cruce. WABA = stub
  (cambio 14).

## Riesgos

- **Propina en `orders.total_cents`** → hoy el total **incluye** propina (`billing/totals.ts`). Sacarla de
  métricas depende de cómo el cambio **06** deje la composición. Coordinar: si 06 separa la propina en
  `payments`/cuenta, la analítica debe basarse en **ventas (subtotal − descuento)**, no en `total_cents`
  crudo. Documentar la dependencia 06→16 y, si 06 aún no aplicó, usar la base de ventas sin propina derivada
  de items (`order_items.subtotal_cents`, como ya hace `profit-query.ts`).
- **Rango libre y performance** → un rango muy amplio agrega muchas filas; mantener los mismos índices por
  `(business_id, created_at)` y descartar outliers como hoy. Limitar el span máximo si hace falta.
- **Timezone AR** → desde/hasta se interpretan a medianoche AR (`date-fns-tz`), no en UTC naïve, para que
  "hoy"/"este mes" cierren bien (mismo patrón que `startOfDayInTz` en `reports-query.ts`).
- **Doble fuente de redención** → el conteo sale del trigger `0019` (`redeemed_count`) y de
  `campaign_messages.redeemed_at`. Usar una sola como verdad en el reporte para no mostrar números
  inconsistentes.
- **Centavos** → todo en `*_cents`, formateo con `src/lib/currency.ts`; ratios (% facturado, redención,
  margen) como número, nunca floats de dinero.
- **Multi-tenant** → toda query por `business_id` + RLS; el panel consolidado House+Golf es del cambio **14**,
  no de este.

## Preguntas abiertas

- [ ] **Base de ingresos sin propina**: ¿se reporta como `subtotal − descuento` (desde `order_items`) o como
      `orders.total_cents` una vez que el cambio 06 lo deje sin propina? Propuesta: alinear con 06; mientras
      tanto, ventas = suma de `subtotal_cents` de items no cancelados (ya disponible en `profit-query.ts`).
- [ ] **¿La propina se elimina por completo de los paneles** o se mueve a una vista de caja/propinas aparte?
      La reunión dice "sacar de las métricas" (§4/§7.17) y "manejar por otro lado" (§7.12). Propuesta: fuera
      de analítica; visible sólo en contexto de caja/cobro.
- [ ] **Rango libre**: ¿límite máximo de span (ej. 1 año) y default al entrar (hoy `7d`)? Propuesta: default
      `30d`, máximo configurable.
- [ ] **Permisos de Campañas**: hoy `assertCanManage` exige `admin`. ¿Se habilita `encargado` (como otros
      módulos de admin) o queda sólo dueño? Propuesta: alinear con el resto (encargado puede), salvo objeción.
- [ ] **Reporte proveedor↔salida**: ¿qué dimensiones muestra (por proveedor, por insumo, por período) y con
      qué granularidad? Depende del shape de `getSupplierProductOutflow` del cambio 12; coordinar contrato.
- [ ] **Comparación período anterior** con rango libre: ¿se calcula el período inmediatamente anterior del
      mismo span (como hace hoy `previousRange`)? Propuesta: sí, mantener la comparación con el span previo.
