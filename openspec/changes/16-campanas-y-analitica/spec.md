# Spec — 16-campanas-y-analitica Campañas (redención) y analítica filtrable por período, sin propina

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.
> Reglas transversales: dinero en **centavos**, **timezone AR** (`date-fns-tz`), scope **`business_id` + RLS**,
> mutaciones en Server Actions validadas con Zod. **Propina por fuera** de las métricas (regla transversal
> §6; afecta 05/06/11/16): la composición del total la corrige el cambio **06**, acá se asegura el lado
> analítica/presentación.

## ADDED Requirements

### Requisito: Filtrar la analítica por rango de fechas libre

El sistema DEBE permitir filtrar los reportes por un **rango de fechas custom** (desde/hasta) además de los
presets actuales (`today`/`yesterday`/`7d`/`30d`), interpretando los límites a medianoche en **timezone AR**.
`getReportData` (`src/lib/admin/reports-query.ts`) acepta el rango custom y el page de reportes
(`src/app/[business_slug]/admin/(authed)/reportes/page.tsx`) lo propaga a **todas** las queries (las "extra"
de `reports-extra-query.ts`/`profit-query.ts` ya reciben `startIso/endIso`).

#### Escenario: El dueño elige un mes específico

- **Dado** el dueño de "House" en el panel de reportes
- **Cuando** elige "Personalizado" y selecciona desde `2026-04-01` hasta `2026-04-30`
- **Entonces** todas las métricas (ventas, merma, rentabilidad, % facturado, redención) se calculan sobre ese
  rango interpretado en horario AR (medianoche AR a medianoche AR)
- **Y** la comparación contra el período anterior usa el span inmediatamente previo (mismo largo).

#### Escenario: Los presets siguen funcionando

- **Dado** el panel de reportes sin rango custom
- **Cuando** el dueño elige el preset `7d`
- **Entonces** el comportamiento es el de hoy (últimos 7 días en AR), sin regresión.

#### Escenario: La merma respeta el rango libre

- **Dado** un rango custom de dos semanas
- **Cuando** se calcula la merma (`profit-query.ts:getProfitMetrics().mermaCents`)
- **Entonces** la merma reportada corresponde sólo a las salidas por merma dentro de ese rango (AR), en centavos.

### Requisito: Reportar la salida de productos por proveedor

El sistema DEBE exponer, como sección de analítica filtrable por período, la **relación proveedor ↔ salida de
productos** (proveedor → insumo → consumo por venta), consumiendo la query base que provee el cambio **12**
(`src/lib/proveedores/queries.ts:getSupplierProductOutflow`, sobre `supplier_ingredients` ×
`ingredient_consumptions`). Es **estimativa**, como la merma, y respeta `business_id` + RLS.

#### Escenario: Salida estimada por proveedor en un período

- **Dado** un proveedor "Distribuidora Norte" vinculado a insumos en "House" (vínculo del cambio 12)
- **Cuando** el dueño abre el reporte proveedor↔salida con un rango custom del mes
- **Entonces** ve, por proveedor, la salida estimada de sus insumos asociada a ventas en ese rango (cantidad y
  valor en centavos)
- **Y** el cálculo queda acotado al `business_id` del panel.

#### Escenario: Sin el cambio 12 aplicado, la sección no rompe el panel

- **Dado** un entorno donde el cambio 12 (proveedores) aún no está disponible
- **Cuando** se carga el panel de reportes
- **Entonces** la sección proveedor↔salida se muestra vacía o deshabilitada, sin romper el resto del reporte
  (dependencia explícita 12→16).

## MODIFIED Requirements

### Requisito: Calcular las métricas de ventas sin propina

Hoy la base de ingresos de los reportes y del dashboard sale de `orders.total_cents`, que **incluye propina**
(`src/lib/billing/totals.ts`: `total = subtotal − descuento + propina`). El comportamiento cambia: las
métricas de **ventas/ingresos** DEBEN reflejar **ventas sin propina** (`subtotal − descuento`, derivable de
`order_items` como ya hace `profit-query.ts`). La fuente de verdad de la composición del total es el cambio
**06**; acá se asegura que la analítica no compute propina como ingreso.

#### Escenario: El ingreso reportado excluye la propina

- **Dado** un día con ventas de $100.000 y $12.000 de propina
- **Cuando** el dueño mira el ingreso del día en reportes/dashboard
- **Entonces** el ingreso figura como $100.000 (ventas sin propina), no $112.000
- **Y** el mismo criterio aplica a las series por día y a las comparaciones de período.

#### Escenario: Coherencia con el cambio 06

- **Dado** que el cambio 06 dejó la propina fuera del total facturable
- **Cuando** la analítica toma la base de ventas
- **Entonces** usa **ventas (subtotal − descuento)** y no `total_cents` crudo, evitando doble criterio entre
  cobro y analítica.

### Requisito: Respetar el rango libre en rentabilidad, % facturado y redención

Hoy `getMenuEngineering`/`getFiscalSummary`/`getMarketingSummary` reciben `startIso/endIso` pero el page sólo
los alimenta con los presets de `ReportRange`. El comportamiento cambia: estas métricas (popularidad por
**rentabilidad**, **% facturado sobre ventas**, **redención de campañas**) DEBEN calcularse sobre el **rango
custom** cuando está activo, sin reimplementar su lógica.

#### Escenario: % facturado sobre el rango elegido

- **Dado** un rango custom del trimestre
- **Cuando** se calcula el % facturado (`getFiscalSummary.invoicedRatePct`)
- **Entonces** el ratio corresponde a las ventas facturadas vs. ventas (sin propina) de ese rango exacto.

#### Escenario: Rentabilidad (menu engineering) sobre el rango elegido

- **Dado** un rango custom
- **Cuando** se calculan los cuadrantes estrella/vaca/puzzle/perro (`getMenuEngineering`)
- **Entonces** popularidad y rentabilidad se computan sobre las ventas de ese rango, no sobre un preset fijo.

### Requisito: Hacer visible y consistente la redención de campañas por período

Hoy la redención se marca por trigger (`0019`: `redeemed_at` en `campaign_messages`, `redeemed_count` en
`campaigns`) y se resume en `getMarketingSummary.redemptionRatePct`, pero la lectura por campaña no está
cerrada de punta a punta ni alineada al filtro por período. El comportamiento cambia: la **redención por
campaña** (códigos personales canjeados y monto asociado) DEBE ser **consultable y consistente**, usando una
sola fuente de verdad, y DEBE respetar el rango por período del reporte.

#### Escenario: Ver redención de una campaña

- **Dado** una campaña lanzada en "House" con códigos personales canjeados
- **Cuando** el dueño abre el detalle de la campaña
- **Entonces** ve cuántos códigos se canjearon y el monto asociado, coherente con el `redeemed_count` del
  trigger (sin números contradictorios entre `redeemed_count` y `campaign_messages.redeemed_at`).

#### Escenario: Redención dentro del período del reporte

- **Dado** el panel de reportes con un rango custom
- **Cuando** se muestra la redención de campañas
- **Entonces** el conteo/monto corresponde a canjes ocurridos dentro de ese rango (AR), por `business_id`.

### Requisito: Alinear los permisos de gestión de campañas

Hoy `src/lib/admin/campaigns-actions.ts:assertCanManage` exige rol `admin` (o plataforma), excluyendo
`encargado`, a diferencia de otros módulos de back-office. El comportamiento cambia: la gestión de campañas
DEBE habilitarse para los roles que el cliente defina (propuesta: `admin`/`encargado`, alineado con el resto),
centralizando el check en `src/lib/permissions/can.ts`.

#### Escenario: El encargado gestiona campañas (si se habilita)

- **Dado** un usuario `encargado` de "House" y la decisión de habilitar `encargado`
- **Cuando** crea o lanza una campaña
- **Entonces** la action lo permite (mismo criterio que otros módulos de admin).

#### Escenario: El mozo no gestiona campañas

- **Dado** un usuario con rol `mozo`
- **Cuando** intenta crear/lanzar/cancelar una campaña
- **Entonces** la action responde error de permiso y no modifica datos.

## REMOVED Requirements

### Requisito: Quitar las tarjetas de propina de la analítica/dashboard

El sistema DEBE dejar de exponer la **propina** como métrica en analítica/dashboard. Se remueven (o se dejan de
renderizar en los paneles de métricas) las superficies de propina de `src/lib/admin/dashboard-query.ts`
(`getTipsToday` y `tipsCents` de `getPaymentMix`/`PaymentMix`) y cualquier render de propina en
`src/components/admin/reports/*`. La propina, si se quiere ver, vive sólo en el contexto de **caja/cobro**, no
en analítica.

#### Escenario: El dashboard ya no muestra propina

- **Dado** el dashboard del dueño de "House"
- **Cuando** lo abre
- **Entonces** no aparece la tarjeta de "Propinas de hoy" ni la propina dentro del mix de pagos como métrica
  de analítica.

#### Escenario: La propina sigue disponible en caja

- **Dado** que la propina se cobró en una cuenta
- **Cuando** el cajero revisa el contexto de caja/cobro
- **Entonces** la propina sigue siendo visible ahí (no se borra el dato; sólo se saca de las métricas).
