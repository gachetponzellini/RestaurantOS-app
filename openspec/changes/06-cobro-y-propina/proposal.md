# 06-cobro-y-propina — Propina fuera del facturable, métodos y split

> Estado: 📋 propuesto · Origen: Reunión §4 (Caja) · §7.6 · §6 · Design: sí

## Por qué

En la demo se marcaron varios errores de cobro que tocan **dinero real**:

1. **La propina va dentro del total facturable.** El posnet separa lo impositivo; si la propina está en
   el total, se le cobran impuestos a la propina. **La propina DEBE ir por fuera** del total facturable
   y por fuera de las métricas. Hoy `calculateTotals` (`src/lib/billing/totals.ts`) hace
   `total = subtotal − descuento + propina`: **mete la propina en el total** (bug central).
2. **El "+10%" de tarjeta está mal.** Se debe corregir/quitar ese recargo del 10% en tarjeta.
3. **El "link de MP" está mal ubicado.** El link de Mercado Pago **no** corresponde a la pantalla de
   cobro del mozo; pertenece al flujo en que **el cliente pide desde su teléfono**. Hay que sacarlo del
   cobro del mozo.
4. **Faltan métodos de pago.** Se necesitan: efectivo, tarjeta, **QR de MP**, transferencia, **cheque**
   (existe pero casi no se usa) y **cortesía** (invitaciones, "a él no le cobré"). Hoy `cortesia` aparece
   en la UI pero **no** existe en el enum de métodos (`src/lib/caja/types.ts`,
   `src/lib/caja/actions.ts::VALID_METHODS`, constraint de `0036/0043`).
5. **Split** por ítems o por cantidad de personas (ya existe; se reafirma y se ajusta para que la
   propina prorrateada no infle el facturable).
6. El cobro se registra en **caja principal** o **caja del bar** (ya soportado vía `caja_id`).

## Qué cambia

- **Propina por fuera del facturable:** el total facturable pasa a ser `subtotal − descuento`. La
  propina se registra y se cobra **aparte** (ya hay `orders.tip_cents` y `payments.tip_cents`), nunca
  sumada al `total_cents` facturable ni a las métricas de ventas.
- **Sacar el "+10%" de tarjeta:** el recargo por método (`payment_method_configs.adjustment_percent`)
  para tarjeta se pone en **0** (corrección de seed/config), y se revisa la UI que lo aplica.
- **Sacar el link de MP del cobro del mozo:** se quita `mp_link` de los métodos ofrecidos en la pantalla
  de cobro del mozo; el QR de MP (`mp_qr`) sí se mantiene para cobro presencial.
- **Agregar métodos `cortesia` y `cheque`** al enum de métodos y a la constraint (migración nueva).
  `cortesia` = monto **no facturable** (cuenta saldada por invitación), no suma a ventas.
- **Split** por ítems / por personas: el prorrateo de propina sigue separado del `expected` facturable.

## Alcance

**Incluye:**
- Corregir `calculateTotals` para que el **total facturable** no incluya propina (exponer la propina
  como dato aparte, no sumado).
- Ajustar `expectedBySplitItems` / `recalcOrderTotals` para que la propina no infle el facturable.
- Migración para agregar `cortesia` y `cheque` a la constraint de `payments.method` y al enum TS.
- Quitar `mp_link` del cobro del mozo (UI) y poner `adjustment_percent` de tarjeta en 0.
- Definir el comportamiento de `cortesia` (cuenta saldada, no factura, no métrica de ventas).

**No incluye (fuera de alcance):**
- Rediseñar el flujo de pago del cliente desde su teléfono (sólo se confirma que el link de MP vive ahí;
  el flujo cliente es del cambio 03).
- Facturación ARCA / emisión (cambios 09 y 13).
- Cambiar el arqueo/corte de caja (sólo se garantiza que la propina queda fuera del esperado de ventas;
  `calculateExpectedCash` ya suma sólo `cash`).

## Impacto

- **Archivos** (reales):
  `src/lib/billing/totals.ts`, `src/lib/billing/cuenta-actions.ts` (`recalcOrderTotals`),
  `src/lib/billing/cobro-actions.ts` (`registrarPago`, `iniciarPagoMp`), `src/lib/billing/types.ts`,
  `src/lib/caja/types.ts` (`PaymentMethod`), `src/lib/caja/actions.ts` (`VALID_METHODS`,
  `upsertPaymentMethodConfig`), `src/lib/caja/expected-cash.ts` (revisión),
  `src/app/[business_slug]/mozo/mesa/[id]/cobrar/cobrar-client.tsx` (quitar `mp_link`, recargo),
  `src/app/[business_slug]/mozo/mesa/[id]/cuenta/cuenta-client.tsx` (método `cortesia`).
- **Datos:** migración `supabase/migrations/0052_payment_methods_cortesia_cheque.sql` — ampliar la
  constraint `check` de `payments.method` a incluir `cortesia` y `cheque`; idem en
  `payment_method_configs` si aplica. Policies RLS heredadas (scope `business_id`). **Sin** cambios a
  `orders.tip_cents` / `payments.tip_cents` (ya existen desde `0035/0036`).
- **Tipos:** `pnpm db:types` → `src/lib/supabase/database.types.ts` tras la migración.
- **Permisos:** `cortesia` (saldar sin cobrar) debe requerir permiso (encargado/admin), vía
  `src/lib/permissions/can.ts`. Revisar que el mozo no pueda saldar por cortesía sin autorización.
- **Integraciones:** Mercado Pago — el QR (`mp_qr`) se mantiene en cobro; el **link** (`mp_link`) sale
  del cobro del mozo. Token/credenciales MP: nunca en specs/commits; referidos por su ubicación en
  `businesses` (config por negocio). ARCA fuera de alcance.

## Riesgos

- **Dinero real / cross-módulo** (billing ↔ caja ↔ pagos): corregir el total podría descuadrar splits,
  arqueo o pagos parciales → mitigación: ver `design.md` y tests de prorrateo/cierre.
- Agregar `cortesia` sin permiso permitiría "regalar" cuentas → mitigación: gate de permiso + registro
  de quién saldó por cortesía.
- Quitar la propina del total podría romper UIs que leían `total_cents` como "lo que paga el cliente" →
  mitigación: exponer claramente `total_facturable` vs `propina` vs `total_a_cobrar` en la cuenta.

## Preguntas abiertas

- [ ] ¿`cheque` se usa realmente o se documenta como método inactivo por defecto?
- [ ] En `cortesia`, ¿la propina puede existir igual (alguien deja propina aunque la cuenta sea
      cortesía) o cortesía implica propina 0?
- [ ] ¿El total a cobrar que ve el cliente muestra la propina sugerida aparte, o la propina se ingresa
      al momento del pago con tarjeta/QR?
