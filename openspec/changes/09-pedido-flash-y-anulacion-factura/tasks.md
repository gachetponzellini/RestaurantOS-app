# Tareas — 09-pedido-flash-y-anulacion-factura Pedido flash + anulación de factura

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.
> Dinero en centavos · scope business_id + RLS · permisos en `can.ts`.

## 1. Datos (si aplica)
- [ ] Migración `supabase/migrations/00NN_factura_anulacion.sql` (sólo lo que falte):
  - [ ] `alter table public.invoices add column cancelled_reason text` (motivo de anulación).
  - [ ] `alter table public.invoices add column cancels_invoice_id uuid references
        public.invoices(id)` (link nota-de-crédito → factura anulada), si se modela la NC como fila.
  - [ ] RLS: reusa policies de `invoices` (`members_update` ya existe en `0048`); verificar scope
        `business_id`.
  - [ ] Pedido flash: **sin tablas nuevas** — usa `orders`/`order_items` con `product_id null`
        (ya soportado por `0020_soften_product_fks.sql`).
- [ ] `pnpm db:types` → `src/lib/supabase/database.types.ts` (si se agregaron columnas).

## 2. Dominio (TDD)
- [ ] Permisos: test (rojo) en `src/lib/permissions/can.test.ts` para `canAnularFactura`
      (admin/encargado = true; mozo/personal = false). Implementar en `src/lib/permissions/can.ts`.
- [ ] **Pedido flash** — test (rojo) de la acción: crea `order` con un `order_item`
      `product_id = null`, concepto libre, `subtotal_cents`/`total_cents` = monto; rechaza monto ≤ 0
      y concepto vacío. Implementar `crearPedidoFlash` en `src/lib/orders/` (o `src/lib/billing/`):
      Zod + `requireMozoActionContext` + permiso + scope `business_id`.
- [ ] **Anular factura** — test (rojo): factura `authorized` + motivo ⇒ emite nota de crédito por el
      provider (probar contra `src/lib/afip/sandbox.ts`) y deja la original `cancelled` con motivo;
      sin motivo ⇒ falla; rol `mozo` ⇒ falla. Implementar `anularFactura` en
      `src/lib/afip/emit-invoice.ts` reusando `AFIPProviderClient` (`provider.ts`) y mapeo de tipos
      `nota_credito_a/b` (`tusfacturas.ts` / `sandbox.ts`).
- [ ] **Re-facturar** — extender el guard de `emitInvoice`: sólo bloquear si la factura
      `authorized` no está `cancelled`. Test: order con factura `cancelled` re-factura OK; con
      `authorized` vigente, bloquea (comportamiento actual preservado).

## 3. UI
- [ ] Pedido flash: formulario (concepto + monto) en `src/components/admin/facturacion/` y/o panel
      del encargado; formatea con `src/lib/currency.ts`.
- [ ] Anulación con motivo: acción en la lista de facturas (`src/components/admin/facturacion/`) que
      pide el motivo obligatorio y dispara `anularFactura`; botón "Re-facturar" cuando la factura
      quedó `cancelled`.

## 4. Verify
- [ ] `pnpm typecheck` y `pnpm test` en verde.
- [ ] Revisión fresca: anular = nota de crédito + `cancelled` (no se borra la factura); re-facturar
      sólo cuando la previa está `cancelled`.
- [ ] Marcar ✅ en `openspec/changes/README.md`.
