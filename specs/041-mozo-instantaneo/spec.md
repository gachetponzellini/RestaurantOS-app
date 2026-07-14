# Feature Specification: Mozo instantáneo (cobro sin refresh + envío seguro)

**Feature Branch**: `041-mozo-instantaneo`

**Created**: 2026-07-14

**Status**: ✅ Done (2026-07-14) — implementada + **validada en vivo con rol real** (mozo). Cierra la capa cliente del bug crítico [cobro-doble-submit](../../../../wiki/analyses/cobro-doble-submit.md). Issue [#57](https://github.com/gachetponzellini/RestaurantOS-app/issues/57) cerrada.

**Input**: Análisis [wiki/analyses/perf-percibida-operacion-mozo.md](../../../../wiki/analyses/perf-percibida-operacion-mozo.md) — **fase 2** (flujo caliente del mozo). Continúa la [spec 039](../039-fundaciones-perf-percibida/spec.md).

## Contexto y problema

Con las fundaciones de la spec 039 (skeletons + streaming), la navegación ya no "congela". Falta el segundo cuello: en el flujo de **cobro** cada pago dispara un `router.refresh()` que **re-ejecuta toda la pantalla de cobro** (incluida la mutación `iniciarCobro` que corre en el render), así que tras cobrar un split el mozo espera un round-trip completo para ver el progreso. Y en el **envío a cocina**, un fallo de red no muestra nada (el throw queda sin capturar): el mozo "no ve pasar nada" y reenvía a ciegas, lo que puede **duplicar la comanda** (la action no es idempotente).

Esta spec toca **plata** (cobro) y **ruteo a cocina** (envío). Regla dura ([spec 21](../../src/lib/ui/use-optimistic-action.ts)): **nunca optimismo de plata**. La instantaneidad del cobro se logra **mergeando la fila que el server YA persistió** (`registrarPago` devuelve `{ payment, splitDone, orderClosed }`), nunca un incremento local ni marcar pagado antes del `ok`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cobro que refleja el pago al instante, sin recargar (Priority: P1)

Al cobrar una mesa (una o varias sub-cuentas), el mozo registra cada pago y hoy espera a que se recargue toda la pantalla para ver el progreso. El pago ya quedó persistido server-side; la espera es puro round-trip evitable.

**Why this priority**: Es el final del flujo caliente y donde más se siente la latencia (cada split = un refresh completo que reejecuta `iniciarCobro`). Mergear la fila ya persistida es instantáneo **sin mentir** (nunca se muestra pagado antes del `ok`).

**Independent Test**: Cobrar un split en efectivo/tarjeta y ver que el progreso ("falta cobrar", barra, estado del split) se actualiza de inmediato, sin parpadeo de recarga; el número reflejado es exactamente el que devolvió el server.

**Acceptance Scenarios**:

1. **Dado** un cobro con un pago en **efectivo/tarjeta**, **Cuando** lo registro, **Entonces** el split pasa a pagado y el "falta cobrar" baja **al instante** con el monto **que devolvió el server** (`payment.amount_cents`), sin `router.refresh()`.
2. **Dado** que el pago es por **Mercado Pago**, **Cuando** se confirma (por el webhook), **Entonces** el cobro se refleja vía **refresh** (no hay fila local que mergear) — **nunca** se marca cobrado por adivinanza del cliente.
3. **Dado** que registro el pago que **cierra la orden**, **Cuando** el server responde `orderClosed: true`, **Entonces** se muestra "mesa cobrada" y se redirige al salón **por esa señal del server**, no por una suma calculada en el cliente.
4. **Dado** que por un reintento el mismo pago llega dos veces al merge, **Cuando** se aplica, **Entonces** el monto se suma **una sola vez** (dedup por `payment.id`) — jamás se duplica plata en pantalla.
5. **Dado** un cobro con MP que dispara `router.refresh()`, **Cuando** llegan los splits frescos del server, **Entonces** el estado local se **re-sincroniza** con esa verdad (no queda pisado por un merge viejo).

---

### User Story 2 - Enviar a cocina sin duplicar por un fallo de red (Priority: P2)

Cuando el mozo envía la comanda y la red falla (o se pierde la respuesta), hoy no ve ningún mensaje: el botón se re-habilita y "no pasó nada", así que reenvía — y si el server sí había procesado, se **duplica la comanda** (ítems y plata).

**Why this priority**: Correctitud money/cocina. Menor prioridad que US1 porque el caso es menos frecuente, pero un envío duplicado ensucia cocina y la cuenta. El fix completo (idempotencia server) requiere migración y va en una spec aparte; acá se cierra el disparador más común (retry a ciegas por falta de feedback).

**Independent Test**: Forzar un fallo de red en el envío y ver un mensaje **explícito** ("no pudimos confirmar el envío; revisá la comanda de la mesa antes de reenviar"), en vez de un estado silencioso que invita a reenviar.

**Acceptance Scenarios**:

1. **Dado** que el envío a cocina **lanza** (fallo de red / respuesta perdida), **Cuando** ocurre, **Entonces** veo un mensaje de error explícito que me pide **verificar antes de reenviar**, nunca un estado silencioso.
2. **Dado** que el envío fue exitoso y me quedo en la pantalla (panel embebido), **Cuando** agregué ítems **mientras** se enviaba, **Entonces** esos ítems **no** se borran: solo se quitan del carrito los que se enviaron.

### Edge Cases

- **Doble aplicación del mismo pago**: un pago aplicado dos veces (merge repetido) NO puede sumar dos veces — dedup por `payment.id` (tabla de plata: duplicar = sobrecobro en pantalla).
- **Redirect prematuro**: el redirect/cierre NO puede depender de una suma en el cliente (podría divergir del cierre real de la orden). Solo `orderClosed` del server cierra.
- **Refresh que pisa el merge**: tras un `router.refresh()` (MP / anulación), el estado local debe **resetearse** a los splits del server, sin conservar merges viejos ni pagos ya contados.
- **MP unificado con efectivo**: unificar el callback de MP con el de efectivo/tarjeta llevaría a marcar cobrado sin fila (el pago MP lo registra el webhook) → **doble cobro**. Los dos caminos se mantienen **separados**.
- **Fallo parcial del envío**: si el envío inserta algunos ítems y después falla, quedan ítems huérfanos; su resolución (transacción/idempotencia) es **fuera de alcance** (ver Non-Goals) — acá solo se evita el retry ciego.

## Requirements *(mandatory)*

### Functional Requirements

**Cobro instantáneo (US1)**

- **FR-001 (MODIFIED)**: Al registrar un pago en **efectivo/tarjeta**, el sistema MUST reflejar el resultado **mergeando la fila que devolvió `registrarPago`** (`{ payment, splitDone, orderClosed }`) en el estado local, en lugar de `router.refresh()`. *(Antes: todo pago hacía `router.refresh()`.)*
- **FR-002**: El merge MUST usar **exclusivamente** los valores del server (`payment.amount_cents`, `splitDone`), **nunca** un incremento optimista ni una marca de pagado previa al `ok`.
- **FR-003**: El merge MUST **deduplicar por `payment.id`**: aplicar el mismo pago más de una vez no puede sumar el monto más de una vez.
- **FR-004**: Para pagos por **Mercado Pago**, el sistema MUST seguir reflejando el cobro vía `router.refresh()` (no hay fila local que mergear: el pago lo persiste el webhook). El callback de MP **no** se unifica con el de efectivo/tarjeta.
- **FR-005 (MODIFIED)**: El cierre de la mesa (mensaje "cobrada" + redirect al salón) MUST dispararse por la señal `orderClosed` del server (o por el estado ya-cerrado del `init` al cargar), **no** por una suma calculada en el cliente.
- **FR-006**: Tras un `router.refresh()`, el estado local de splits/pagos-aplicados MUST **re-sincronizarse** con los datos frescos del server (no quedar pisado por el estado previo).
- **FR-007**: Mientras el pago está en curso, el sistema MUST mostrar feedback honesto ("Registrando…") y **no** afirmar el cobro hasta el `ok`.
- **FR-013 (ADDED)**: El botón de confirmar cobro MUST quedar **deshabilitado mientras la Server Action está en vuelo** (`isPending`), en **ambos** clientes de cobro (mozo `cobrar-client.tsx` y admin `cobrar-desktop-client.tsx`). Cierra la **capa cliente** del bug crítico [cobro-doble-submit](../../../../wiki/analyses/cobro-doble-submit.md) (tocar "Confirmar" N veces registraba N pagos → inflaba la caja; reproducido en datos reales). La **capa server** (idempotencia real de `registrarPago`) requiere migración y va en **spec 042**.

**Envío a cocina seguro (US2)**

- **FR-008 (ADDED)**: El envío a cocina MUST **capturar** un throw (fallo de red / respuesta perdida) y mostrar un mensaje **explícito** que pida verificar la comanda de la mesa **antes de reenviar**, en lugar de re-habilitar el botón en silencio.
- **FR-009 (ADDED)**: Al enviarse con éxito, el sistema MUST quitar del carrito **solo los ítems enviados** (no vaciarlo entero), preservando ítems agregados durante el envío en curso (relevante en el panel embebido que no navega).

**Invariantes de correctitud (no negociables)**

- **FR-010**: Ningún camino puede marcar un split/orden como cobrado **antes** del `ok` del server (spec 21).
- **FR-011**: Todo merge es **por `id`** (upsert/replace del split + dedup del pago), jamás push/increment ciego.
- **FR-012**: El comportamiento de **MP** (registro por webhook + refresh) **no** cambia; no se introduce merge local para MP.

### Non-Goals (fuera de alcance — specs posteriores)

- **Idempotencia server de las mutaciones de plata/cocina** (capa robusta): `registrarPago` (clave `request_id` + `UNIQUE` en `payments`, ver [cobro-doble-submit](../../../../wiki/analyses/cobro-doble-submit.md)) y `enviarComanda` (insert transaccional). Ambas requieren migración → **spec 042**.
- **No-navegar + merge de overlay** al enviar comanda (se mantiene la navegación al salón, ya suavizada por el skeleton de la spec 039).
- Merge local para el cobro **admin embebido** (`cobrar-desktop-client`), que ya usa `orderClosed` para el redirect. Paridad opcional futura.
- Caja / rendición / realtime (fase 3).

### Key Entities

Sin entidades ni migraciones nuevas. Usa lo que `registrarPago` ya devuelve (`payment`, `splitDone`, `orderClosed`) y los tipos existentes (`OrderSplit`, `Payment`).

## Success Criteria *(mandatory)*

- **SC-001**: Cobrar un split en efectivo/tarjeta refleja el progreso **al instante**, sin recarga; el monto mostrado es idéntico al que persistió el server.
- **SC-002**: En ninguna secuencia (incluido reintento) el monto cobrado en pantalla supera lo que el server registró (cero sobrecobro visual); MP nunca se marca cobrado sin confirmación del webhook.
- **SC-003**: El cierre/redirect ocurre solo cuando el server dice `orderClosed`; nunca por math del cliente.
- **SC-004**: Un fallo de red en el envío muestra un mensaje explícito de verificación; no hay estado silencioso que invite a reenviar a ciegas.
- **SC-005**: `pnpm typecheck` + `pnpm test` en verde, con test unitario del merge (dedup + solo-server + orderClosed). Verificación en vivo con **rol real** (mozo).
- **SC-006**: Cero regresión en el camino MP ni en el cierre de mesa.

## Assumptions

- `registrarPago` ya devuelve `{ payment: Payment; splitDone: boolean; orderClosed: boolean }` (verificado en `src/lib/billing/cobro-actions.ts`) — no requiere cambio server.
- El target de US1 es la vista **mozo** `cobrar-client.tsx` (la que hoy siempre hace `router.refresh()`); el cobro admin desktop ya usa `orderClosed`.
- La lógica de merge se extrae **pura y testeable** (`src/lib/billing/split-merge.ts`), acorde al principio de dominio testeable.
- Dependencia: continúa la [spec 039](../039-fundaciones-perf-percibida/spec.md); la fase 3 (caja/rendición/realtime) y la idempotencia server (042) siguen a esta.
