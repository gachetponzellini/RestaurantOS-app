# 09-pedido-flash-y-anulacion-factura — Pedido flash por monto + anulación de factura con motivo

> Estado: 📋 propuesto · Origen: Reunión §4 (Panel) · §7.13 · Design: no

## Por qué

Dos necesidades del mostrador/encargado surgidas en la reunión (§4 · Panel y §7.13):

1. **"Pedido flash" / factura por monto (NUEVO)**: facturar un evento por **monto total SIN
   desglose**, creando un **producto ficticio** (ej. "Lunch torneo Banco Macro"). Hoy `emitInvoice`
   (`src/lib/afip/emit-invoice.ts`) parte de una `order` con su `total_cents`, y la `order` se
   construye desde productos reales del catálogo (`src/lib/comandas/actions.ts`). Falta un camino
   para cargar una orden de **un solo renglón por monto** sin tener que crear el producto en la carta.

2. **Anular pedido/factura con motivo + re-facturar**: cancelar una factura mal hecha (ej. al mozo)
   con **motivo obligatorio** y poder **re-facturar**. Hoy ya existe cancelación con motivo en dos
   lugares — el flujo de delivery (`updateOrderStatus` exige `cancelled_reason`) y la anulación de
   mesa (`anularMesa` escribe `cancelled_reason`/`cancelled_at`, gateado por `canTransitionMesa` =
   encargado/admin). Lo que **falta** es **anular el comprobante AFIP**: la tabla `invoices` ya tiene
   `status` con valor `'cancelled'` y existen los tipos `nota_credito_a/b`
   (`0048_invoices.sql`, `src/lib/afip/types.ts`), pero `emit-invoice.ts` **no** tiene un camino que
   anule/emita nota de crédito. Acá se especifica ese delta.

## Qué cambia

- **Pedido flash**: nueva acción que crea una `order` con un **único ítem por monto** (renglón
  ficticio con descripción libre, sin `product_id` real), lista para cobrar y/o facturar con el
  `emitInvoice` existente. El renglón no se da de alta en la carta (`products`); se modela como ítem
  con concepto/monto. Permiso: mostrador/encargado.
- **Anular factura con motivo**: nueva acción `anularFactura` que, dado un comprobante `authorized`,
  registra la anulación con **motivo obligatorio** — emitiendo la **nota de crédito** asociada
  (`nota_credito_a/b`, ya tipada) vía el provider y dejando la factura original en `status =
  'cancelled'`. Habilita **re-facturar** la orden (el guard "ya tiene factura autorizada" deja de
  bloquear cuando la anterior fue anulada).
- **Permiso explícito**: anular factura es del **mostrador/encargado**, no del mozo
  (`src/lib/permissions/can.ts`).

## Alcance

**Incluye:**
- Lógica/acción de **pedido flash** (orden de un renglón por monto, concepto libre) en
  `src/lib/orders/` o `src/lib/billing/`, con Zod, centavos y scope `business_id`.
- Acción `anularFactura` en `src/lib/afip/emit-invoice.ts` (motivo obligatorio; emite nota de
  crédito por el provider; setea `invoices.status='cancelled'`).
- Ajuste del guard de `emitInvoice` para permitir **re-facturar** una orden cuya factura previa
  quedó `cancelled` (hoy bloquea con "ya tiene una factura autorizada").
- Permiso `canAnularFactura` en `src/lib/permissions/can.ts` (encargado/admin).
- UI mínima en `src/components/admin/facturacion/` y/o panel del encargado para pedido flash y
  anulación con motivo.

**No incluye (fuera de alcance):**
- Conexión real con **ARCA** (certificado/CUIT/punto de venta, sandbox→prod): cambio **13**.
- Anular **mesa/producto** en salón: ya existe (`anularMesa`, `canCancelItem`); acá sólo se cita.
- Cálculo de IVA/neto de la nota de crédito más allá de `calculateAmounts` ya existente
  (`src/lib/afip/calculate-amounts.ts`).
- Catálogo de productos ficticios reutilizables (el renglón flash es ad-hoc por evento).

## Impacto

- **Archivos** (reales): `src/lib/afip/emit-invoice.ts` (anular + re-facturar),
  `src/lib/afip/provider.ts` / `tusfacturas.ts` / `sandbox.ts` (camino de nota de crédito),
  `src/lib/orders/` (acción de pedido flash) y/o `src/lib/billing/cobro-actions.ts` (cobro del flash),
  `src/lib/permissions/can.ts`, `src/components/admin/facturacion/`.
- **Datos:** principalmente reusa `invoices` (`status='cancelled'`, tipos `nota_credito_*` ya
  existen en `0048_invoices.sql`). Migración nueva `supabase/migrations/00NN_factura_anulacion.sql`
  **sólo si** hace falta persistir el **motivo** de anulación y el link factura↔nota de crédito
  (ej. `invoices.cancelled_reason text`, `invoices.cancels_invoice_id uuid`). El pedido flash usa
  `orders`/`order_items` existentes (renglón con `product_id null`, ya soportado por
  `0020_soften_product_fks.sql`).
- **Tipos:** regenerar `pnpm db:types` si se agregan columnas a `invoices`.
- **Permisos:** agregar `canAnularFactura` (encargado/admin) en `src/lib/permissions/can.ts`.
- **Integraciones:** AFIP/ARCA (vía provider para la nota de crédito); el provider real es el
  cambio 13, acá se respeta la interfaz `AFIPProviderClient` y se prueba contra `sandbox`.

## Riesgos

- **Doble facturación / re-facturación** → el guard de `emitInvoice` ("ya tiene factura
  authorized") sólo debe bloquear si la factura vigente **no** está `cancelled`. Test: order con
  factura `cancelled` debe poder re-facturarse; con factura `authorized` vigente, no.
- **Anular sin nota de crédito** → en AR, "anular" un comprobante autorizado se hace **emitiendo
  nota de crédito**. Se modela así (no se borra la factura); `status='cancelled'` queda como estado
  derivado del comprobante original.
- **Pedido flash y desglose fiscal** → el monto va sin desglose de productos, pero `calculateAmounts`
  igual separa neto/IVA del total para el comprobante (mismo camino que una factura normal).
- **Permiso del mozo** → el mozo **no** anula factura ni hace pedido flash de facturación; se valida
  con `canAnularFactura` (encargado/admin), coherente con "anular es del mostrador" (§6).
- **Dinero en centavos** → el renglón flash y la nota de crédito en `*_cents`.

## Preguntas abiertas

- [ ] Para el **pedido flash**, ¿el renglón ficticio necesita un `station_id`? Asumimos **no**
      (no va a comanda; es facturación pura). Se inserta con `station_id = null`.
- [ ] ¿La anulación exige siempre **nota de crédito** o hay casos de factura `failed`/no autorizada
      que sólo se descartan? Asumimos: `authorized` → nota de crédito; `failed` → no requiere NC.
- [ ] ¿El motivo de anulación se persiste en `invoices` (columna nueva) o basta el
      `provider_response`/`error_message`? Asumimos columna `cancelled_reason` por trazabilidad.
- [ ] ¿Re-facturar es automático tras anular o un paso explícito del encargado? Asumimos **paso
      explícito** (anular y luego volver a emitir).
