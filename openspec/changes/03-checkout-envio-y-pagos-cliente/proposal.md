# 03-checkout-envio-y-pagos-cliente — Envío bonificado, cupón automático y estado de pago en delivery

> Estado: 📋 propuesto · Origen: Reunión §4 (Carta/Checkout), §7.4, §7.9 · Design: no

## Por qué

En la demo, sobre el checkout del cliente y la vista de pedidos del local, salieron tres ajustes
concretos:

- El **envío** hoy, cuando el costo es 0, se muestra como "$0,00" en el detalle del pedido
  (`order-tracking.tsx`) y como "Gratis" sólo si es retiro o cupón `free_shipping`. El cliente
  pidió comunicarlo como **"Bonificado"** (no "$0"), porque el delivery es una cortesía del local,
  no un precio de cero (§7.4). Es un cambio de **comunicación**, no de cálculo: el negocio puede
  tener `delivery_fee_cents = 0` (default de `0010`) y aun así querer la etiqueta "Bonificado".
- El **cupón de descuento** ya funciona con ingreso manual ("Aplicar" → `previewPromoCode`), pero
  se pidió que, si el cliente **ya tiene un cupón asociado a su cuenta**, se **auto-aplique** al
  entrar al checkout sin tener que tipearlo (§7.9).
- En la vista del local, el pedido de delivery **no muestra con claridad si está pagado**
  (Mercado Pago) **o si paga en efectivo** al recibir. Los datos existen
  (`orders.payment_method` / `payment_status`, ya en `AdminOrder`), pero `order-card.tsx` no los
  pinta. Se pidió un **indicador de pago** visible en el tablero (§7.4).

> Nota: la **auto-derivación de pedidos online a cocina** (auto-march) se especifica en el cambio
> **05** (estados/comandas). Acá sólo modelamos el **indicador** de estado de pago, no el ruteo.

## Qué cambia

- El detalle del pedido del cliente (`order-tracking.tsx`) y el resumen del checkout
  (`checkout-form.tsx`) muestran **"Bonificado"** cuando es un **envío a domicilio con costo 0**
  (distinto de "Retiro", que sigue siendo "Gratis"/sin envío). Cuando el costo es > 0 se muestra
  el monto formateado, como hoy.
- Al cargar el checkout, si el cliente autenticado tiene un **cupón asignado a su cuenta** válido
  para el negocio, el sistema lo **pre-aplica** (mismo camino de validación que el ingreso
  manual), y el cliente puede quitarlo. Si no hay cupón asignado, el comportamiento es el actual
  (ingreso manual).
- El tablero de pedidos del local (`order-card.tsx`) muestra un **indicador de pago**:
  "Pagado" (MP `paid`), "Paga en efectivo" (efectivo), o el estado intermedio de MP
  (pendiente/falló), derivado de `payment_method` + `payment_status` que la query ya trae.
- El **token de Mercado Pago** sigue siendo **por negocio** (columna `mp_access_token` en la tabla
  `businesses`, ya usada por `persist-order.ts` y la página de confirmación). Este cambio **no**
  introduce el secreto ni lo expone; sólo consume el flag `mp_accepts_payments` para decidir si
  ofrece MP, como hoy.

## Alcance

**Incluye:**
- Etiqueta **"Bonificado"** para envío a domicilio con `delivery_fee_cents = 0` en
  `src/components/checkout/order-tracking.tsx` y `src/components/checkout/checkout-form.tsx`.
- **Auto-aplicación** del cupón asignado a la cuenta del cliente en el checkout, reutilizando
  `previewPromoCode` (`src/lib/promos/preview-action.ts`) / `validatePromoCode`
  (`src/lib/promos/validate.ts`). La carga del cupón asociado se hace del lado servidor en la
  página del checkout y se pasa como prop inicial a `CheckoutForm`.
- **Indicador de estado de pago** en `src/components/admin/order-card.tsx`, usando
  `payment_method`/`payment_status` que ya provee `src/lib/admin/orders-query.ts`.

**No incluye (fuera de alcance):**
- **Auto-march** de pedidos online a cocina (eso es el cambio **05**).
- Alta/edición del **token de Mercado Pago** o de la config de pagos del negocio (vive en
  `businesses`; su gestión es otro flujo).
- **Crear/asignar** cupones a cuentas (este cambio sólo **consume** un cupón ya asignado; el alta
  de cupones y su asignación es del módulo de promos/campañas, §16).
- Cambiar el **cálculo** del envío o del total (sigue en centavos en `persist-order.ts`); sólo se
  cambia su **rótulo** cuando es 0.

## Impacto

- **Archivos** (reales):
  - `src/components/checkout/order-tracking.tsx` (rótulo "Bonificado" en la fila de envío).
  - `src/components/checkout/checkout-form.tsx` (rótulo "Bonificado"; consumir cupón inicial
    pre-aplicado).
  - Página del checkout que renderiza `CheckoutForm` (carga server-side del cupón asignado a la
    cuenta y de `delivery_fee_cents`/`mp_accepts_payments` del negocio).
  - `src/lib/promos/validate.ts` / `src/lib/promos/preview-action.ts` (reutilizados; posible
    helper para resolver "cupón asignado a la cuenta").
  - `src/components/admin/order-card.tsx` (indicador de pago).
  - `src/lib/admin/orders-query.ts` (ya trae `payment_method`/`payment_status`; sin cambios de
    query salvo necesidad).
- **Datos:** **sin migración nueva de schema** para "Bonificado" ni para el indicador
  (`delivery_fee_cents`, `payment_method`, `payment_status` ya existen — `0001`, `0010`). La
  **asociación cupón↔cuenta** depende de cómo se modele en promos: si esa relación **ya existe**,
  no hay migración; si **no existe**, queda **fuera de alcance** (la define §16) y este cambio
  consume lo que haya. RLS: scope `business_id` heredado; sin policies nuevas.
- **Tipos:** n/a salvo que promos agregue una relación nueva (no en este cambio).
- **Permisos:** sin cambios en `src/lib/permissions/can.ts`. Ver carta/checkout es público; el
  tablero de pedidos ya es de admin/encargado.
- **Integraciones:** **Mercado Pago** (consumo del flag/token **por negocio** en `businesses`,
  sin exponer el secreto). Sin cambios en ARCA/WhatsApp.

## Riesgos

- **Confundir "Bonificado" con "Retiro"** → el cliente cree que paga envío cuando retira, o
  viceversa. Mitigación: "Retiro"/sin envío se mantiene como hoy; "Bonificado" aplica **sólo** a
  `delivery_type = 'delivery'` con costo 0.
- **Cupón auto-aplicado inválido** (vencido, agotado, no llega al mínimo) → error confuso al
  entrar. Mitigación: pasar el cupón por la **misma validación** (`validatePromoCode`); si no
  pasa, no se pre-aplica y se cae al flujo manual, sin romper el checkout.
- **Doble descuento / inconsistencia con el submit** → el cliente ve un total y el servidor
  calcula otro. Mitigación: la **fuente de verdad** del total sigue siendo `persist-order.ts`,
  que re-valida el cupón atómicamente; la auto-aplicación es sólo preview, igual que el manual.
- **Exponer el token de MP** al pre-cargar config del negocio. Mitigación: nunca enviar
  `mp_access_token` al cliente; sólo el booleano `mp_accepts_payments` viaja a `CheckoutForm`
  (como hoy).

## Preguntas abiertas

- [ ] El "cupón asociado a la cuenta": ¿existe **hoy** una relación cliente↔cupón en el modelo de
      promos, o hay que crearla (y entonces es del cambio §16)? Define si hay migración o sólo
      consumo.
- [ ] Si el cliente ya **tipeó** un cupón distinto al auto-asignado, ¿cuál gana? Propuesta: el
      ingresado manualmente reemplaza al auto-aplicado (acción explícita del usuario).
- [ ] "Bonificado": ¿es **siempre** que el costo de envío sea 0, o el negocio necesita un **flag**
      explícito "envío bonificado" distinto de "cobro $0"? (afecta si alcanza con
      `delivery_fee_cents = 0` o hace falta una columna nueva).
