# Tareas — 06-cobro-y-propina Propina fuera del facturable, métodos y split

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.

## 1. Datos
- [ ] Migración `supabase/migrations/0052_payment_methods_cortesia_cheque.sql`: ampliar la constraint
      `check` de `payments.method` (de `0036`/`0043`) para incluir `'cortesia'` y `'cheque'`; ídem en
      `payment_method_configs.method` si tiene constraint propia. Policies RLS heredadas (scope
      `business_id`). **No** tocar `orders.tip_cents` / `payments.tip_cents` (ya existen).
- [ ] `pnpm db:types` → `src/lib/supabase/database.types.ts`.

## 2. Dominio (TDD)
- [ ] Test (rojo): `src/lib/billing/totals.test.ts` — `calculateTotals` devuelve `total_cents = subtotal
      − descuento` (propina **no** sumada) y expone `tip_cents` aparte.
- [ ] Test (rojo): `src/lib/billing/totals.test.ts` — `expectedBySplitItems` prorratea **facturable**
      (`subtotal − descuento`) y la propina queda expuesta aparte, no dentro de `expected_amount_cents`.
- [ ] Test (rojo): cobro — `registrarPago` acepta `cortesia` (no suma a ventas) sólo con permiso, y
      `cheque` como método válido; `mp_link` sigue rechazado en cobro presencial.
- [ ] Implementar: corregir `src/lib/billing/totals.ts` (`calculateTotals`, `expectedBySplitItems`).
- [ ] Implementar: `src/lib/billing/cuenta-actions.ts::recalcOrderTotals` escribe **facturable** en
      `orders.total_cents`; revisar el recálculo equivalente en `src/lib/comandas/actions.ts::cancelarItem`.
- [ ] Implementar: agregar `cortesia`/`cheque` a `PaymentMethod` (`src/lib/caja/types.ts`) y a
      `VALID_METHODS` (`src/lib/caja/actions.ts`).
- [ ] Implementar: gate de permiso para `cortesia` en `src/lib/permissions/can.ts` (encargado/admin) y
      aplicarlo en `src/lib/billing/cobro-actions.ts::registrarPago`.
- [ ] Config: poner `adjustment_percent = 0` para tarjeta (seed/`upsertPaymentMethodConfig`).

## 3. UI
- [ ] `src/app/[business_slug]/mozo/mesa/[id]/cobrar/cobrar-client.tsx`: quitar `mp_link` ("Link
      Mercado Pago") de los métodos; mantener `mp_qr`; mostrar `total facturable` + `propina` +
      `total a cobrar` por separado; no aplicar +10% en tarjeta.
- [ ] `src/app/[business_slug]/mozo/mesa/[id]/cuenta/cuenta-client.tsx`: alinear el método `cortesia`
      con el enum y el permiso.

## 4. Verify
- [ ] `pnpm typecheck` y `pnpm test` en verde (suites de billing y caja).
- [ ] Revisión fresca de archivos tocados (billing + caja + permisos + UI cobro/cuenta).
- [ ] Marcar ✅ en `openspec/changes/README.md`.
