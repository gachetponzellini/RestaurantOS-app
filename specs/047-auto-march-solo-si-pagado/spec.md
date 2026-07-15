# Feature Specification: Auto-march solo si el pedido está pagado

**Feature Branch**: `047-auto-march-solo-si-pagado`

**Created**: 2026-07-15

**Status**: Implementado (2026-07-15) — `pnpm typecheck` + `pnpm test` (665 pass; 1 timeout flaky de cloud en `cuenta.integration`, verde aislado) en verde. **Pendiente:** verify en vivo con rol real (encargado) + print-agent — T012. Issue [#66](https://github.com/gachetponzellini/RestaurantOS-app/issues/66). Milestone: Post-demo · Growth & hardening. Ajusta la política de auto-march definida en [spec 05](../../../wiki/specs/05-estados-pedido-y-comandas/).

**Input**: Pedido de Juan 2026-07-15 — "cuando creo un pedido takeaway y pago con efectivo, debería aparecer en «Nuevos», y al pasarlo a «Preparando» aparecen las comandas y una notificación; pero si el pedido se paga directamente, la comanda se debería imprimir directo".

## Contexto y problema

El [spec 05](../../../wiki/specs/05-estados-pedido-y-comandas/) introdujo el **auto-march**: al crear un pedido, si el pago es `cash` y no es diferido, el sistema lo rutea a cocina automáticamente. La pregunta abierta de ese spec (`design.md:102-103`, `proposal.md:69`) — *"¿el auto-march se dispara al crear el pedido online o solo cuando está pagado?"* — quedó resuelta de facto por **"al crear si es cash"**. Este spec la **redecide**: solo cuando está **pagado**.

### Comportamiento actual

`src/lib/orders/persist-order.ts:719-729`:

```ts
if (paymentMethod === "cash" && !isScheduledForLater(scheduledAtIso)) {
  await routeOrderToCocina(order.id, business.id);
}
```

`persistOrder` siempre inserta `payment_status: "pending"` (`persist-order.ts:462`); el default de `payment_method` es `cash` (`persist-order.ts:53`). Entonces **todo** pedido remoto en efectivo (pickup o delivery) marcha a cocina apenas se crea: `routeOrderToCocina` crea las comandas (`status: "pendiente"`) y pone el pedido en `preparing`. El print-agent hace pull de cualquier comanda `pendiente` (`api/print-agent/route.ts:64`), así que **se imprime al instante**. El pedido nunca pasa por «Nuevos».

El pago **MP** ya se comporta como se desea: nace `pending`, y solo el webhook lo sube a `paid` y ahí marcha (`api/mp/webhook/route.ts:284-296`).

### El problema

Para un pedido remoto (el cliente pide desde la carta web), "elegí efectivo" significa **"pago al retirar/recibir"**, no "ya pagué". Marchar a cocina y **imprimir** algo todavía no cobrado ni confirmado le saca al mostrador el control de qué entra a cocina. La regla correcta: **imprime directo solo lo pagado** (hoy = MP aprobado); el efectivo espera la confirmación manual del encargado.

### Trampa latente que el cambio activa (co-requisito)

Hoy el efectivo nunca está en `pending` (auto-marcha en la creación), por lo que un camino roto de la UI **nunca se ejerce**. Al sacar el auto-march, el efectivo pasa a nacer `pending` y ese camino se activa:

- El botón **«Confirmar» inline de la card** (`order-card.tsx:211-221`) llama `onConfirm` → `confirmarPedido` → `routeOrderToCocina` (crea comandas, imprime, pasa a `preparing`). **Correcto.**
- Pero al abrir el **detalle** del pedido, el `OrderDetailSheet` recibe solo `onAdvance`, nunca `onConfirm` (`order-card.tsx:240-247`). Su footer, para un `pending`, muestra la etiqueta «Confirmar» (`NEXT_LABEL["pending"]`, `order-detail-sheet.tsx:68`) pero el click llama `onAdvance(order, "confirmed")` (`order-detail-sheet.tsx:444`) → `updateOrderStatus`, que **solo cambia la columna `status`** (`update-status.ts:52-64`): no crea comandas, no rutea a cocina, no dispara el print-agent (no hay trigger de DB que cree comandas por cambio de status).

Resultado post-cambio: el encargado abre el detalle → «Confirmar» (`pending → confirmed`) → «Empezar a preparar» (`confirmed → preparing`), y el pedido aterriza en «Preparando» con **cero comandas y sin imprimir**, con aspecto totalmente normal. Es una **pérdida silenciosa**, no un "atascado" visible. Verificado contra el código: no hay ningún trigger que compense; las comandas solo se insertan vía `routeOrderToCocina`.

**Causa raíz:** la máquina de estados permite `pending → confirmed`, `confirmed → preparing` y `pending → preparing` vía `updateOrderStatus` (`status.ts:13-21`), y ninguna de esas transiciones rutea a cocina. El único camino que crea comandas para un pedido online es `confirmarPedido`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Efectivo remoto queda en «Nuevos» (Priority: P1)

Como encargado, cuando entra un pedido de la carta web en **efectivo** (pickup o delivery), aparece en la columna **«Nuevos»** con una notificación, y **nada se imprime todavía**. Yo decido cuándo mandarlo a cocina.

**Why this priority**: Es el pedido de Juan y la regla de negocio central ("el local manda"). Evita imprimir/cocinar algo no confirmado ni cobrado.

**Independent Test**: Crear un pedido pickup y uno delivery con `payment_method: "cash"` desde el checkout → ambos quedan `status: "pending"`, sin comandas, y el print-agent no recibe nada; aparecen en «Nuevos»; se dispara la notif `order.pending` al encargado.

**Acceptance Scenarios**:

1. **Dado** un pedido remoto en efectivo recién creado, **Cuando** consulto su estado, **Entonces** es `pending`, tiene 0 comandas y cae en la columna «Nuevos».
2. **Dado** ese pedido, **Cuando** se crea, **Entonces** se dispara la notificación `order.pending` al encargado (ya existe en `persist-order.ts:706`).
3. **Dado** ese pedido, **Cuando** aún no lo marché, **Entonces** el print-agent no tiene ninguna comanda para imprimir de ese pedido.

---

### User Story 2 - Marchar un pending crea comandas e imprime (Priority: P1)

Como encargado, cuando toco «Confirmar» sobre un pedido en efectivo en «Nuevos» — **tanto desde la card como desde el detalle** — el pedido se rutea a cocina: se crean las comandas, el print-agent las imprime y el pedido pasa a «Preparando».

**Why this priority**: Sin esto el efectivo quedaría atascado o (peor) se perdería silenciosamente. Es el co-requisito que hace seguro el cambio.

**Independent Test**: Sobre un pedido `pending` online, disparar «Confirmar» desde la card y (en otro pedido) desde el `OrderDetailSheet` → en ambos casos `routeOrderToCocina` se ejecuta, se crean comandas `pendiente` y el pedido queda `preparing`.

**Acceptance Scenarios**:

1. **Dado** un pedido `pending` online, **Cuando** toco «Confirmar» en la card, **Entonces** se crean comandas y el pedido pasa a `preparing`.
2. **Dado** un pedido `pending` online, **Cuando** abro el detalle y toco «Confirmar», **Entonces** ocurre lo mismo (crea comandas + `preparing`), **no** un cambio de status sin comandas.
3. **Dado** un pedido `pending` online, **Cuando** intento avanzarlo a `confirmed`/`preparing` por un camino que no sea `confirmarPedido` (state-machine vía `updateOrderStatus`), **Entonces** la operación es rechazada (guard server), de modo que no exista forma de moverlo sin rutear a cocina.

---

### User Story 3 - Lo pagado imprime directo (Priority: P1)

Como cliente que paga con **Mercado Pago**, cuando mi pago se aprueba, el pedido marcha a cocina e imprime solo, sin que el encargado tenga que confirmarlo.

**Why this priority**: Es la otra mitad de la regla ("pagado = directo") y **no debe regresionar**: ya funciona vía webhook.

**Independent Test**: Simular el webhook MP con `payment_status → "paid"` (no diferido) → se llama `routeOrderToCocina`. Diferido → `notifyScheduledConfirmed`, lo marcha el cron.

**Acceptance Scenarios**:

1. **Dado** un pedido MP `pending`, **Cuando** el webhook lo pasa a `paid` y no es diferido, **Entonces** se llama `routeOrderToCocina` (marcha + imprime).
2. **Dado** un pedido MP `paid` **diferido**, **Cuando** llega el webhook, **Entonces** no marcha en el acto (lo hace el cron a la hora), como hoy.

### Edge Cases

- **dine-in (mozo)**: no pasa por `persistOrder`; usa `enviarComanda`, que crea comandas al enviar. Sin cambios. `confirmarPedido` sigue rechazando `dine_in` (`confirm-order.ts:55`).
- **Diferidos (scheduled)**: el schema fuerza MP en diferidos; los marcha el cron (`march-scheduled.ts`) leyendo `payment_status="paid"`. No dependen del bloque que se elimina.
- **Idempotencia**: `routeOrderToCocina` es no-op si el pedido ya tiene comandas (`route-to-cocina.ts:30-40`); confirmar dos veces no duplica.
- **MP no pagado en «Nuevos»**: con el cambio conviven en «Nuevos» efectivos (a confirmar) y MP `pending`/abandonados (que no se deben marchar). El botón «Confirmar» no valida `payment_status` — el `paymentBadge` de la card («Paga en efectivo» vs «Pago pendiente», `order-card.tsx:116-126`) es la señal visual. Gatear la confirmación por pago es un refinamiento fuera de alcance (ver Non-Goals).
- **Confirmar sin permiso**: `confirmarPedido` exige encargado/admin/platform (`canConfirmOrder`, `confirm-order.ts:34`).

## Requirements *(mandatory)*

### Functional Requirements

**Regla de auto-march (US1, US3)**

- **FR-001 (MODIFIED)**: `persistOrder` MUST NOT rutear a cocina en la creación del pedido. Se elimina el bloque de auto-march de `cash` (`persist-order.ts:719-729`). Todo pedido remoto nace `pending` y queda en «Nuevos».
- **FR-002**: El único auto-march automático MUST ser el del pago aprobado: el webhook de MP al pasar `payment_status → "paid"` (no diferido) llama `routeOrderToCocina` (`mp/webhook/route.ts:284-296`) — **sin cambios**.
- **FR-003**: Un pedido en efectivo (pickup/delivery) MUST marcharse **solo** por acción manual del encargado vía `confirmarPedido` → `routeOrderToCocina`.
- **FR-004**: La notificación `order.pending` al encargado en la creación (`persist-order.ts:706`) MUST preservarse — es el aviso de "hay un pedido para confirmar".

**Fix de la trampa del detalle (US2)**

- **FR-005 (MODIFIED)**: El `OrderDetailSheet` MUST recibir `onConfirm` y, para un pedido `pending` online (`status === "pending" && delivery_type !== "dine_in"`), su botón «Confirmar» MUST llamar `onConfirm` (→ `confirmarPedido` → `routeOrderToCocina`), **no** `onAdvance(order, "confirmed")`. La card MUST pasarle `onConfirm` al sheet.
- **FR-006 (ADDED — guard server)**: `updateOrderStatus` MUST rechazar avanzar un pedido online (no `dine_in`) que está en `pending` (defensa en profundidad: la única marcha válida de un `pending` online es `routeOrderToCocina` vía `confirmarPedido`/webhook, no un cambio de columna). Así ninguna UI presente o futura puede moverlo a `confirmed`/`preparing` sin crear comandas.

### Non-Goals (fuera de alcance)

- **Capacidad de "cobrar al crear"**: no existe hoy un flujo donde el encargado/mozo cree un takeaway y lo cobre en mano (el único caller de `persistOrder` es el checkout público). No se agrega en este spec; si se agregara, un pedido que naciera `payment_status="paid"` marcharía por la misma regla FR-002.
- **Gatear «Confirmar» por `payment_status`**: no se bloquea confirmar un MP no pagado; se deja la señal visual del `paymentBadge`. Refinamiento posible a futuro.
- **Alertas de pedidos `pending` viejos** (sonido/resaltado por antigüedad): fuera de alcance; el objetivo es que el efectivo espere confirmación, no automatizar el aviso.
- **Datos / schema / RLS / migraciones**: cero cambios de DB. Puro código TS + docs.
- **Cron de diferidos y flujo dine-in / mozo**: no se tocan.

### Key Entities

Sin entidades ni migraciones nuevas. Se tocan: `orders.status` (semántica de transición para online), comandas (se siguen creando solo vía `routeOrderToCocina`).

## Success Criteria *(mandatory)*

- **SC-001**: Un pedido remoto en efectivo (pickup y delivery) recién creado queda `pending`, con 0 comandas, sin nada para el print-agent, y visible en «Nuevos» con notif al encargado.
- **SC-002**: Marchar ese pedido — desde la card **y** desde el `OrderDetailSheet` — crea comandas (`pendiente`), el print-agent las imprime y el pedido pasa a `preparing`. No existe camino de UI que lo mueva a `preparing` sin comandas.
- **SC-003**: Un pedido MP que pasa a `paid` (no diferido) marcha e imprime vía webhook (sin regresión); diferido lo marcha el cron.
- **SC-004**: dine-in, diferidos y el flujo del mozo sin cambios.
- **SC-005**: `pnpm typecheck` + `pnpm test` en verde, con tests nuevos que blindan FR-001, FR-002 y FR-005/006. Verificación en vivo con **rol real** (encargado).

## Assumptions

- `persistOrder` tiene un único caller productivo: `createOrder` ← checkout web público (`checkout-form.tsx:273`), que ofrece solo `delivery`/`pickup` y pagos `mp | cash`. Ningún otro flujo (chatbot, reservas, endpoints) crea pedidos por acá (grep verificado).
- MP siempre nace `payment_status="pending"`; no hay caso "MP paid sincrónico en la creación" que el bloque cubriera y el webhook no.
- `routeOrderToCocina` es idempotente y no tiene efecto de notificación/impresión propio: la impresión la dispara el print-agent al ver comandas `pendiente`, que `confirmarPedido`/webhook siguen creando.
- El camino manual (`confirmarPedido`) ya está cableado en la card (`order-card.tsx:211` → `orders-realtime-board.tsx:255`) con auth de encargado/admin.
