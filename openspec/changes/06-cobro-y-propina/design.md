# Design — 06-cobro-y-propina Propina fuera del facturable, métodos y split

## Contexto y problema

El cambio toca **dinero real** y **cruza módulos** (billing ↔ caja ↔ pagos), por eso requiere diseño.

El núcleo es **dónde vive la propina** en el modelo. Hoy:

- `src/lib/billing/totals.ts::calculateTotals` calcula
  `total_cents = subtotal − descuento + propina` → **la propina queda dentro del total facturable**.
- `recalcOrderTotals` (`src/lib/billing/cuenta-actions.ts`) escribe ese `total_cents` (con propina) en
  `orders.total_cents`.
- `expectedBySplitItems` prorratea la propina dentro del `expected_amount_cents` de cada split.
- En `comandas/actions.ts::cancelarItem` el recálculo también hace `newTotal = subtotal + tip + fee −
  discount` (misma mezcla).

Esto contradice la regla de la reunión: **el posnet separa lo impositivo**; si la propina está en el
total, se le cobran impuestos. La propina debe quedar **fuera del facturable y fuera de las métricas**.

Datos disponibles (no hace falta crearlos): `orders.tip_cents` (`0035`), `payments.tip_cents` y
`payments.attributed_mozo_id` (`0036`), `CajaLiveStats.total_propinas_cents` ya separado
(`src/lib/caja/types.ts`). Lo que falta es **no sumar** la propina al facturable y agregar los métodos
`cortesia` / `cheque`.

## Opciones consideradas

1. **Mantener un único `total_cents` con propina y "restarla" al facturar.**
   - Pros: menos cambios en lectura.
   - Contras: frágil; cada consumidor debe acordarse de restar la propina; ya generó el bug. No cumple
     "propina fuera de métricas".

2. **Separar conceptualmente `total_facturable` (= subtotal − descuento) de `propina` y de
   `total_a_cobrar` (= facturable + propina), persistiendo el facturable en `orders.total_cents`.**
   *(elegida)*
   - Pros: el facturable nunca incluye propina; la propina vive en su campo (`tip_cents`) y en las
     métricas separadas; el "monto a cobrar" se compone sólo en el punto de cobro/UI.
   - Contras: hay que ajustar todos los puntos que hoy suman propina (totals, recalc, split, cancelar
     ítem) y revisar UIs que leían `total_cents` como "lo que paga el cliente".

3. **Tabla aparte de propinas desacoplada de la cuenta.**
   - Pros: aislamiento máximo.
   - Contras: sobre-ingeniería; `tip_cents` ya existe en orders/payments; agrega complejidad sin
     beneficio claro para el piloto.

Para `cortesia`: se modela como **método de pago no facturable** (saldando la cuenta) en vez de un
descuento del 100%, para que quede trazable como "invitación" y no contamine métricas de descuento.

## Decisión

**Opción 2** + `cortesia`/`cheque` como métodos.

- **`total_facturable` = `subtotal − descuento`.** `calculateTotals` deja de sumar `tip` al
  `total_cents`. Se mantiene `tip_cents` en el resultado como dato separado; el "total a cobrar" =
  `total_cents + tip_cents` se compone sólo en el cobro/UI, nunca se persiste como facturable.
- **`recalcOrderTotals`** escribe en `orders.total_cents` el **facturable** (sin propina); `tip_cents`
  sigue en su columna.
- **Split:** `expectedBySplitItems` prorratea **facturable** (`subtotal − descuento`) por split y expone
  la propina prorrateada **aparte** (no dentro de `expected_amount_cents`).
- **Métricas/caja:** la propina sólo va a `total_propinas_cents`; `total_ventas_cents` y
  `calculateExpectedCash` (que ya suma sólo `cash`) no incluyen propina como venta.
- **`cortesia`:** método no facturable; saldar por cortesía no suma a ventas, requiere permiso
  (encargado/admin) y registra al autor. **`cheque`:** método válido común (no facturable-especial,
  suma al cobro como cualquier no-efectivo).
- **`mp_link` fuera del cobro del mozo:** se quita de los métodos del cobro del mozo; `mp_qr` se queda.
- **"+10%" tarjeta:** `payment_method_configs.adjustment_percent` de tarjeta = 0 (config/seed) y se
  revisa la UI que aplica `calculateAdjustment`.

## Impacto técnico

- **Máquina de estados / fórmula de dinero (antes → después):**
  ```
  ANTES:
    total_cents (facturable)  = subtotal − descuento + propina   ← propina adentro
    expected_split            = (subtotal − descuento + propina) prorrateado
    métricas venta            = riesgo de incluir propina

  DESPUÉS:
    total_facturable          = subtotal − descuento             ← propina AFUERA
    propina (tip_cents)       = dato separado (orders.tip_cents / payments.tip_cents)
    total_a_cobrar (UI/cobro) = total_facturable + propina       ← se compone, no se persiste
    expected_split.facturable = (subtotal − descuento) prorrateado
    expected_split.propina    = propina prorrateada, expuesta aparte
    métricas: ventas = facturable ; propina = total_propinas_cents (separado)
  ```

- **Datos:** migración `supabase/migrations/0052_payment_methods_cortesia_cheque.sql`:
  - Ampliar la constraint `check` de `payments.method` (definida en `0036`, extendida en `0043` con
    `transfer`) para incluir `'cortesia'` y `'cheque'`.
  - Ídem en `payment_method_configs` si su `method` tiene constraint propia.
  - Sin cambios a `orders.tip_cents` / `payments.tip_cents` (ya existen). RLS heredada (scope
    `business_id`). Regenerar tipos con `pnpm db:types`.

- **Contratos entre módulos:**
  - `billing/totals.ts` (cálculo puro) deja de mezclar propina; **lo consumen** `cuenta-actions.ts`
    (`recalcOrderTotals`) y la UI de cuenta/cobro.
  - `billing/cobro-actions.ts::registrarPago` sigue derivando `attributed_mozo` para la propina y
    aceptando `caja_id` (principal/bar); debe aceptar `cortesia`/`cheque` y respetar el permiso de
    cortesía. `iniciarPagoMp` compone `total = facturable + propina` para el QR (no para el facturable).
  - `caja/types.ts` y `caja/actions.ts::VALID_METHODS` agregan `cortesia`/`cheque`; `caja/expected-cash`
    no cambia (sólo `cash`).
  - `permissions/can.ts` gana un chequeo para `cortesia` (encargado/admin).

- **Multi-tenant / RLS:** pagos, cuentas y configs ya scopean por `business_id` (migraciones
  `0035/0036/0043/0047`). La propina y la cortesía no cruzan negocios; el `caja_id` ata el cobro a una
  caja del mismo negocio.

## Trade-offs y consecuencias

- **Migración de lectura:** UIs/reportes que leían `orders.total_cents` como "lo que paga el cliente"
  deben pasar a componer `facturable + propina` en el punto de cobro. Riesgo acotado y testeable.
- **Cortesía como método vs descuento:** elegimos método no facturable; queda la deuda de definir si la
  cortesía admite propina (ver Preguntas abiertas del proposal).
- **Plan de reversión:** la migración sólo **amplía** una constraint (no borra valores), así que es
  segura; revertir la fórmula es volver a sumar `tip` en `calculateTotals`. Los datos de `tip_cents`
  permanecen intactos en ambos sentidos.
