# Spec — 03-checkout-envio-y-pagos-cliente Envío bonificado, cupón automático y estado de pago en delivery

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.

## MODIFIED Requirements

### Requisito: Comunicar el envío a domicilio sin costo como "Bonificado"

Hoy, cuando el costo de envío es 0, el detalle del pedido del cliente
(`src/components/checkout/order-tracking.tsx`) muestra "$0,00" y el resumen del checkout
(`src/components/checkout/checkout-form.tsx`) muestra "Gratis" sólo para retiro o cupón
`free_shipping`. El sistema DEBE mostrar **"Bonificado"** en la fila de envío cuando el pedido es
**a domicilio** (`delivery_type = 'delivery'`) y el costo de envío es **0** (en centavos). Cuando
el costo es mayor a 0, DEBE mostrar el monto formateado vía `src/lib/currency.ts`, como hoy. El
caso **retiro** mantiene su comportamiento actual (sin envío). Es un cambio de rótulo: no altera
el cálculo del total en `persist-order.ts`.

#### Escenario: Envío a domicilio con costo 0

- **Dado** un pedido a domicilio cuyo `delivery_fee_cents` es 0
- **Cuando** el cliente ve el detalle del pedido (confirmación/tracking)
- **Entonces** la fila de envío muestra "Bonificado" en lugar de "$0,00"

#### Escenario: Envío a domicilio con costo mayor a 0

- **Dado** un pedido a domicilio cuyo `delivery_fee_cents` es 150000 (en centavos)
- **Cuando** el cliente ve el detalle del pedido
- **Entonces** la fila de envío muestra el monto formateado (p. ej. "$1.500,00"), no "Bonificado"

#### Escenario: Retiro en el local

- **Dado** un pedido con `delivery_type = 'pickup'`
- **Cuando** el cliente ve el resumen del checkout o el detalle del pedido
- **Entonces** se muestra "Retiro"/sin cargo como hoy, no "Bonificado"

## ADDED Requirements

### Requisito: Pre-aplicar el cupón asignado a la cuenta del cliente

El sistema DEBE pre-aplicar automáticamente, al cargar el checkout, un cupón que ya esté asignado
a la cuenta del cliente autenticado y sea válido para el negocio, reutilizando la misma validación
que el ingreso manual (`validatePromoCode` / `previewPromoCode`). La resolución del cupón asignado
se hace del lado servidor y se pasa como prop inicial a `CheckoutForm`. El cliente DEBE poder
**quitarlo**. Si no hay cupón asignado válido, el checkout se comporta como hoy (ingreso manual).
La **fuente de verdad** del descuento sigue siendo `persist-order.ts`, que re-valida el cupón al
confirmar.

#### Escenario: Cliente con cupón válido asignado

- **Dado** un cliente autenticado con un cupón válido asignado a su cuenta para el negocio actual
- **Cuando** abre el checkout
- **Entonces** el cupón aparece **ya aplicado** (con su descuento reflejado en el total) sin que
  el cliente lo tipee
- **Y** el cliente puede quitarlo con "Quitar"

#### Escenario: Cupón asignado inválido (vencido o no llega al mínimo)

- **Dado** un cliente con un cupón asignado que está vencido o no alcanza el `min_order_cents`
- **Cuando** abre el checkout
- **Entonces** el cupón **no** se pre-aplica
- **Y** el checkout queda en el estado de ingreso manual, sin mostrar un error que bloquee la
  compra

#### Escenario: Invitado sin cuenta

- **Dado** un cliente no autenticado (sin cuenta)
- **Cuando** abre el checkout
- **Entonces** no se pre-aplica ningún cupón y el ingreso manual funciona como hoy

#### Escenario: El total mostrado coincide con el confirmado

- **Dado** un cupón pre-aplicado en el checkout
- **Cuando** el cliente confirma el pedido
- **Entonces** `persist-order.ts` re-valida el cupón y el total persistido coincide con el
  mostrado (o, si el cupón ya no es válido al confirmar, se informa y el total se ajusta sin
  cobrar de más)

### Requisito: Indicar el estado de pago del pedido en el tablero del local

El sistema DEBE mostrar, en cada tarjeta de pedido del tablero del local
(`src/components/admin/order-card.tsx`), un indicador del estado de pago derivado de
`payment_method` y `payment_status` (ya provistos por `src/lib/admin/orders-query.ts`): "Pagado"
cuando es Mercado Pago con `payment_status = 'paid'`, "Paga en efectivo" cuando el método es
efectivo, y el estado intermedio de Mercado Pago (pendiente/falló) cuando corresponda. Este
indicador es informativo y sólo lo ven roles con acceso al tablero (admin/encargado).

#### Escenario: Pedido pagado por Mercado Pago

- **Dado** un pedido con `payment_method = 'mp'` y `payment_status = 'paid'`
- **Cuando** el encargado lo ve en el tablero de pedidos
- **Entonces** la tarjeta muestra el indicador "Pagado"

#### Escenario: Pedido en efectivo

- **Dado** un pedido con `payment_method = 'cash'`
- **Cuando** el encargado lo ve en el tablero
- **Entonces** la tarjeta muestra "Paga en efectivo"

#### Escenario: Pago de Mercado Pago pendiente o fallido

- **Dado** un pedido con `payment_method = 'mp'` y `payment_status = 'pending'` (o `'failed'`)
- **Cuando** el encargado lo ve en el tablero
- **Entonces** la tarjeta muestra el estado intermedio correspondiente (pendiente / falló), no
  "Pagado"
