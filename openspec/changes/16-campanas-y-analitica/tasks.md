# Tareas — 16-campanas-y-analitica Campañas (redención) y analítica filtrable por período, sin propina

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.
> Dinero en **centavos**, **timezone AR** (`date-fns-tz`), scope `business_id` + RLS, mutaciones en Server
> Actions con Zod. **Propina por fuera** de las métricas (regla transversal §6): la composición del total la
> corrige el cambio **06**; acá sólo el lado analítica/presentación.
> **Sin migración propia esperada** (campañas usa `0019`; analítica lee tablas existentes; proveedor↔salida lo
> crea el cambio 12). La última migración real es `0051`; si hiciera falta una, usar placeholder `00NN_*`.

## 1. Datos

- [ ] **Sin migración nueva** en condiciones normales. Verificar que alcanza con lo existente:
  - [ ] Campañas/redención → `0019` (`campaigns`, `campaign_messages`, trigger `mark_campaign_message_redeemed`).
  - [ ] Analítica → `orders`/`order_items`/`payments`/`invoices` (`0048`)/`ingredient_consumptions` (`0050/0051`)/
        `campaigns` (`0019`).
  - [ ] Proveedor↔salida → lo provee el cambio **12** (`supplier_ingredients`, `getSupplierProductOutflow`).
- [ ] Sólo si la decisión de "ventas sin propina" exigiera una columna/derivada nueva (a evaluar con la 1ª
      pregunta abierta y con el cambio 06): migración `supabase/migrations/00NN_*.sql` + RLS + `pnpm db:types`.
      Por defecto **no** se espera.

## 2. Dominio (TDD)

### 2a. Rango de fechas libre
- [ ] Test (rojo): `src/lib/admin/<reports-range>.test.ts` — `getReportData` con rango custom `{start,end}`
      acota a esos límites interpretados a **medianoche AR**; los presets (`today`/`yesterday`/`7d`/`30d`)
      siguen igual; la comparación usa el span previo del mismo largo.
- [ ] Implementar en `src/lib/admin/reports-query.ts`: aceptar rango custom además de `ReportRange` en
      `computeRange`/`getReportData` (reusar `startOfDayInTz`/`previousRange`); pasar `startIso/endIso` a las
      queries internas.
- [ ] Verificar que `reports-extra-query.ts` (`getFiscalSummary`/`getMarketingSummary`/`getStationTimings`) y
      `profit-query.ts` (`getMenuEngineering`/`getProfitMetrics`) responden correcto con el rango libre
      (ya toman `startIso/endIso`; cambios mínimos o nulos).

### 2b. Ventas sin propina
- [ ] Test (rojo): `src/lib/admin/<sales-base>.test.ts` — la base de ingresos = **ventas (subtotal − descuento)**,
      no `orders.total_cents` con propina; dado un set con propina, el ingreso reportado la excluye (series por
      día y comparación incluidas).
- [ ] Implementar en `src/lib/admin/reports-query.ts` y `src/lib/admin/dashboard-query.ts`: base de ingresos sin
      propina (derivar de `order_items` como ya hace `profit-query.ts`). Documentar dependencia 06→16.

### 2c. Redención de campañas (consistencia + período)
- [ ] Test (rojo): `src/lib/admin/<campaigns-redemption>.test.ts` — redención por campaña (códigos canjeados +
      monto) consistente con `redeemed_count` (trigger `0019`); una sola fuente de verdad; respeta el rango por
      período y el `business_id` (RLS).
- [ ] Ajustar `src/lib/admin/campaigns-query.ts` para exponer la redención por campaña de forma consistente
      (sin duplicar el conteo entre `redeemed_count` y `campaign_messages.redeemed_at`).

### 2d. Reporte proveedor ↔ salida
- [ ] Test (rojo): `src/lib/admin/<supplier-outflow-report>.test.ts` — dado el shape de
      `getSupplierProductOutflow` (cambio 12), agrega por proveedor la salida estimada (cantidad + valor en
      centavos) en el rango; si la query base no está disponible, devuelve vacío sin romper.
- [ ] Consumir `src/lib/proveedores/queries.ts:getSupplierProductOutflow` desde el page/sección de reportes
      (no reimplementar el cruce; coordinar contrato con el cambio 12).

### 2e. Permisos de campañas
- [ ] Test (rojo): `src/lib/admin/campaigns-actions` — `encargado` puede gestionar (si se habilita), `mozo` no;
      defaults según decisión de la 4ª pregunta abierta.
- [ ] Ajustar `assertCanManage` en `src/lib/admin/campaigns-actions.ts` para centralizar el check en
      `src/lib/permissions/can.ts` (p. ej. `canManageCampaigns`) alineado con el resto de back-office.

## 3. UI

- [ ] `src/components/admin/reports/range-selector.tsx` — opción "Personalizado" con date-pickers (AR);
      default al entrar según 3ª pregunta abierta (propuesta `30d`).
- [ ] `src/app/[business_slug]/admin/(authed)/reportes/page.tsx` — parsear `start`/`end` de `searchParams` y
      propagarlos a **todas** las queries.
- [ ] Quitar propina de los paneles de métricas: en `src/lib/admin/dashboard-query.ts` remover/no exponer
      `getTipsToday` y `tipsCents` (`getPaymentMix`/`PaymentMix`); en `src/components/admin/reports/*` y el
      dashboard, **no** renderizar propina como métrica.
- [ ] Sección nueva proveedor↔salida en `src/components/admin/reports/*` consumiendo la query base del cambio 12.
- [ ] Redención por campaña visible/consistente en `src/components/admin/campaigns/campaign-detail.tsx`.
- [ ] Formateo de dinero con `src/lib/currency.ts` (centavos → display); ratios como número.

## 4. Verify

- [ ] `pnpm typecheck` y `pnpm test` en verde.
- [ ] Revisión fresca de archivos tocados; confirmar que **ninguna métrica de analítica incluye propina** y que
      no quedaron tarjetas de propina en los paneles.
- [ ] Confirmar dependencias: **06** (propina fuera del facturable) y **12** (proveedor↔salida) — si no
      aplicaron, las secciones dependientes degradan sin romper.
- [ ] Marcar ✅ en `openspec/changes/README.md`.
