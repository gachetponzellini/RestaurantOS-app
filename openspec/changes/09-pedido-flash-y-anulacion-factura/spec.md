# Spec — 09-pedido-flash-y-anulacion-factura Pedido flash + anulación de factura

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.
> Dinero en **centavos**; scope **business_id + RLS**; permisos en `src/lib/permissions/can.ts`.

## ADDED Requirements

### Requisito: Crear un pedido flash por monto sin desglose

El sistema DEBE permitir crear una `order` con un **único renglón por monto** y **concepto libre**
(ej. "Lunch torneo Banco Macro"), sin dar de alta el producto en la carta. El renglón se inserta
como `order_item` con `product_id = null` (soportado desde `0020_soften_product_fks.sql`), su
descripción y su `subtotal_cents`; el `total_cents` de la orden iguala ese monto. La acción valida
con Zod (monto > 0, concepto no vacío), corre con scope `business_id` y permiso de
mostrador/encargado. La orden resultante puede cobrarse y/o facturarse con el `emitInvoice`
existente.

#### Escenario: facturar un evento por monto total

- **Dado** un encargado autenticado
- **Cuando** crea un pedido flash "Lunch torneo Banco Macro" por $250.000
- **Entonces** se crea una `order` con un solo `order_item` (`product_id = null`, concepto = "Lunch
  torneo Banco Macro", `subtotal_cents = 25_000_000`)
- **Y** `total_cents` de la orden es 25.000.000 (centavos)
- **Y** el pedido flash queda disponible para emitir factura por ese total

#### Escenario: monto inválido o concepto vacío

- **Dado** un encargado autenticado
- **Cuando** intenta crear un pedido flash con monto $0 o sin concepto
- **Entonces** la acción falla en la validación Zod (monto > 0 y concepto requerido)
- **Y** no se crea ninguna orden

### Requisito: Anular una factura con motivo obligatorio (nota de crédito)

El sistema DEBE permitir a un **encargado o admin** anular un comprobante `authorized` indicando un
**motivo obligatorio**. La anulación emite la **nota de crédito** asociada
(`nota_credito_a`/`nota_credito_b`, según el tipo de la factura original) vía el provider AFIP y
deja la factura original en `status = 'cancelled'`, persistiendo el motivo. El mozo **no** puede
anular facturas.

#### Escenario: anulación emite nota de crédito y marca la factura

- **Dado** una factura `authorized` (factura B) de una orden del negocio
- **Y** un encargado autenticado
- **Cuando** la anula con motivo "Factura mal hecha al mozo"
- **Entonces** se emite la nota de crédito B por el provider y la factura original queda
  `status = 'cancelled'` con el motivo persistido
- **Y** la operación queda trazada (motivo + referencia a la nota de crédito)

#### Escenario: el mozo no puede anular

- **Dado** un usuario con rol `mozo`
- **Cuando** intenta anular una factura
- **Entonces** la acción falla porque `canAnularFactura` es sólo encargado/admin

#### Escenario: anular exige motivo

- **Dado** un encargado y una factura `authorized`
- **Cuando** intenta anularla sin motivo (vacío o sólo espacios)
- **Entonces** la acción falla pidiendo el motivo obligatorio y la factura **no** cambia de estado

## MODIFIED Requirements

### Requisito: Re-facturar una orden cuya factura previa fue anulada

Hoy `emitInvoice` (`src/lib/afip/emit-invoice.ts`) bloquea con "Esta orden ya tiene una factura
autorizada" si encuentra una `invoice` con `status = 'authorized'` para la orden. Pasa a ser
distinto: el guard sólo bloquea si la factura `authorized` está **vigente**; si la factura previa
quedó en `status = 'cancelled'` (anulada con su nota de crédito), la orden **puede volver a
facturarse**. El resto del flujo de emisión (config AFIP, `calculateAmounts`, persistencia en
`invoices`) no cambia.

#### Escenario: re-facturar tras anular

- **Dado** una orden cuya única factura previa quedó `cancelled` (anulada)
- **Cuando** el encargado vuelve a emitir factura para esa orden
- **Entonces** `emitInvoice` **no** bloquea por "ya tiene factura autorizada"
- **Y** se emite un nuevo comprobante `authorized` para la orden

#### Escenario: no re-facturar si hay una factura autorizada vigente

- **Dado** una orden con una factura `authorized` **no** anulada
- **Cuando** se intenta emitir otra factura para esa orden
- **Entonces** `emitInvoice` falla con el guard de factura autorizada vigente (comportamiento actual)
