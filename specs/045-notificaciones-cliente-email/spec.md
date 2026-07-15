# Feature Specification: Notificaciones al cliente por email (puente pre-WhatsApp)

**Feature Branch**: `045-notificaciones-cliente-email`

**Created**: 2026-07-14

**Status**: Draft

**Input**: Los mensajes transaccionales al cliente (estados de pedido online, reservas, comprobante) hoy dependen del canal WhatsApp, bloqueado por la verificación de Meta / templates HSM. Se necesita un **puente por email** que no dependa de terceros, aprovechando que el cliente se loguea con Google (email verificado garantizado). El puente debe ser **reversible sin quitar código**: se vuelve a WhatsApp cambiando un flag por negocio.

## Contexto y estado actual

- Canal al cliente hoy = **WhatsApp únicamente** (`sendWhatsapp`/`enqueueWhatsapp`/`whatsapp_outbox`). Los avisos proactivos exigen **template aprobado por Meta**; sin eso quedan `failed`. Bloqueante para el go-live del piloto (golf-house).
- Existe infra de email productiva: **Resend** (`src/lib/email/send.ts` + `resend-adapter.ts`), hoy usada **solo** para el mail de cierre a los dueños (spec 34). Nunca se usó para el cliente final.
- Eventos transaccionales al cliente que existen hoy (ambos por WhatsApp): cambio de estado de pedido delivery/pickup (`delivery-notify.ts` ← `orders/update-status.ts`) y pedido diferido agendado (`mp/webhook`).
- **No existe** aviso de confirmación de reserva, ni recordatorio, ni envío de comprobante fiscal al cliente.
- El email del cliente **no** se persiste en `orders`/`reservations` (solo `customer_name` + `customer_phone`). Es alcanzable vía `orders.customer_id → customers` y `reservations.user_id → auth.users`, y al crear se guarda el `user_id`/`customer_id` del cliente logueado.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Canal de aviso al cliente configurable por negocio (Priority: P1, fundacional)

Como operador de plataforma / dueño, quiero elegir **por negocio** si los avisos al cliente salen por `whatsapp`, `email` o `both`, para poder operar el piloto con email mientras WhatsApp está trabado y volver a WhatsApp con un cambio de configuración, sin redeploy ni cambios de código.

**Why this priority**: Es la fundación que hace el puente reversible. Sin esto, los eventos siguientes no tienen a dónde rutearse. Encarna la restricción de diseño #1: minimizar el acoplamiento al puente.

**Independent Test**: Setear `customer_channel='email'` en un negocio y disparar un cambio de estado de pedido → se despacha por email y no por WhatsApp. Cambiarlo a `whatsapp` → vuelve al comportamiento anterior. Cambiarlo a `both` → despacha por ambos.

**Acceptance Scenarios**:

1. **Given** un negocio con `customer_channel='email'`, **When** se dispara un evento transaccional al cliente, **Then** el mensaje se despacha por email y no se encola en `whatsapp_outbox`.
2. **Given** un negocio con `customer_channel='whatsapp'` (default histórico), **When** se dispara el mismo evento, **Then** el comportamiento es idéntico al actual (WhatsApp), sin regresión.
3. **Given** un negocio con `customer_channel='both'`, **When** se dispara el evento, **Then** se despacha por ambos canales de forma independiente (la falla de uno no bloquea el otro).

---

### User Story 2 - Avisos de estado de pedido online por email (Priority: P1)

Como cliente que pidió online, quiero recibir por email los cambios de estado de mi pedido (recibido/en preparación/listo/en camino/entregado/cancelado, y el agendado del pedido diferido), para saber en qué anda mi pedido sin depender de WhatsApp.

**Why this priority**: Es el flujo que hoy está roto por el bloqueo de WhatsApp; entrega el valor central del puente el día 1.

**Independent Test**: Con un pedido `delivery` de un cliente con email, mover el estado a `ready` → llega un email con el cuerpo correcto; verificar reglas de supresión (dine_in no recibe, on_the_way solo delivery).

**Acceptance Scenarios**:

1. **Given** un pedido `delivery` con `customer_email` y negocio en `email`, **When** el estado pasa a un estado notificable, **Then** se envía un email con el contenido de la plantilla del negocio (o la default) y queda registrado como enviado.
2. **Given** un pedido `dine_in`, **When** cambia de estado, **Then** no se envía nada (misma supresión que hoy).
3. **Given** un pedido sin `customer_email` resoluble, **When** cambia de estado y el negocio está en `email`, **Then** no rompe la operación; degrada según política (ver FR-013) y queda registrado el motivo.
4. **Given** un pedido diferido `pickup` cuyo pago MP se aprueba, **When** se confirma el agendamiento, **Then** el cliente recibe el email de "pedido agendado".

---

### User Story 3 - Confirmación de reserva por email (Priority: P1)

Como cliente que reservó mesa, quiero recibir por email el acuse de que mi reserva quedó tomada (fecha, hora, personas, local) con un link para verla/cancelarla, para tener comprobante sin depender de WhatsApp.

**Why this priority**: Evento nuevo que hoy no existe por ningún canal; el cliente hoy no recibe nada al reservar. Alto valor y bajo costo.

**Independent Test**: Crear una reserva de un cliente logueado → llega el email de acuse con los datos correctos y el link a `/perfil/reservas`.

**Acceptance Scenarios**:

1. **Given** una reserva creada por un cliente logueado (con `user_id`), **When** la reserva queda `confirmed`, **Then** se envía un email de acuse con fecha/hora/personas/local y link de gestión.
2. **Given** una reserva cargada por el staff a mano (sin `user_id` → sin email), **When** se crea, **Then** no se intenta enviar email y no rompe.
3. **Given** el negocio en `whatsapp`, **When** se crea la reserva, **Then** el acuse sale por WhatsApp (si hay template) — el evento es agnóstico de canal.

---

### User Story 4 - Recordatorio de reserva antes del turno (Priority: P2)

Como cliente con una reserva, quiero un recordatorio por email antes del turno ("te esperamos hoy a las HH:MM"), para no olvidarme. **Informativo, sin pedir confirmación de asistencia** (el double opt-in queda fuera de esta spec — ver Out of Scope).

**Why this priority**: Reduce no-shows con bajo costo, pero no es bloqueante del go-live. Requiere un cron nuevo.

**Independent Test**: Con una reserva `confirmed` que arranca dentro de la ventana de recordatorio y aún no fue recordada, correr el cron → se envía un recordatorio y no se re-envía en corridas posteriores.

**Acceptance Scenarios**:

1. **Given** una reserva `confirmed` que arranca dentro de la ventana de recordatorio, **When** corre el cron, **Then** se envía exactamente un recordatorio y queda registrado (idempotente).
2. **Given** una reserva `cancelled`/`no_show`, **When** corre el cron, **Then** no se envía nada.

---

### User Story 5 - Comprobante fiscal por email (Priority: P2)

Como cliente, quiero recibir por email el comprobante/factura tras la emisión fiscal (AFIP/ARCA), para tener el respaldo.

**Why this priority**: Valor claro pero con dependencia en `src/lib/afip`; puede ir como fast-follow sin bloquear el core del puente.

**Independent Test**: Tras una emisión AFIP exitosa de un pedido con `customer_email`, se envía un email con los datos del comprobante.

**Acceptance Scenarios**:

1. **Given** un comprobante emitido con éxito y un pedido con `customer_email`, **When** termina la emisión, **Then** se envía el email del comprobante una sola vez.
2. **Given** una emisión fallida o sin `customer_email`, **When** termina, **Then** no se envía comprobante y no rompe el flujo fiscal.

---

### Edge Cases

- **Sin email del cliente** (pedido/reserva sin `user_id`/`customer_id`, o `auth.users.email` nulo): no se envía; se registra el motivo; nunca bloquea la operación. Política de degradación en FR-013.
- **Reintento de webhook** (MP re-entrega el evento): la idempotencia evita duplicar el email (dedup por `(business_id, event, ref_id)`).
- **`both` con un canal caído**: el fallo de un canal no afecta al otro ni a la operación.
- **Rate limit del proveedor de email** (Resend free = 100/día): el fallo se registra como `failed` sin romper; reproceso posible.
- **Cambio de email del cliente** después de crear el pedido: el `customer_email` denormalizado es un snapshot inmutable (se avisa a donde estaba al momento del pedido).
- **Deliverability**: dominio verificado con SPF/DKIM/DMARC; `From` con marca del negocio; subdominio dedicado a transaccionales.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST resolver el canal de aviso al cliente por negocio mediante `businesses.customer_channel ∈ {whatsapp, email, both}`.
- **FR-002**: El default de `customer_channel` MUST preservar el comportamiento actual para negocios existentes (`whatsapp`), y el piloto (golf-house) se setea en `email`. [NEEDS CLARIFICATION: ¿default global `whatsapp` y golf-house override a `email`? confirmar]
- **FR-003**: Los puntos de disparo existentes (`delivery-notify.ts`, `mp/webhook`) MUST NOT cambiar su firma ni sus call sites; el ruteo de canal se resuelve en una capa de despacho común.
- **FR-004**: El sistema MUST persistir el email del cliente denormalizado en `orders.customer_email` y `reservations.customer_email`, poblado al crear desde el cliente logueado (`auth.users.email` / `customers.email`).
- **FR-005**: El sistema MUST reusar la lógica pura de supresión existente (`delivery-templates.ts`: dine_in no recibe, on_the_way solo delivery, plantilla apagada) de forma agnóstica de canal.
- **FR-006**: El sistema MUST enviar email vía la infra existente (`sendEmail`/Resend), con `from` y dominio configurables.
- **FR-007**: El envío de email al cliente MUST ser best-effort: nunca lanza ni bloquea la operación (mismo contrato que `enqueueWhatsapp`).
- **FR-008**: El sistema MUST garantizar idempotencia por `(business_id, event, ref_id)` para no duplicar avisos ante reintentos (p. ej. webhooks MP).
- **FR-009**: El sistema MUST renderizar plantillas de email por evento (subject + cuerpo HTML) con branding del negocio y placeholders (`{cliente} {numero} {negocio} {hora}`), consistentes con las plantillas de delivery.
- **FR-010**: El sistema MUST enviar un email de **confirmación de reserva** al crear una reserva de cliente logueado, con datos de la reserva y link de gestión (`/perfil/reservas`).
- **FR-011**: El sistema MUST enviar un **recordatorio de reserva** informativo antes del turno, vía un cron idempotente, sin solicitar confirmación de asistencia. [NEEDS CLARIFICATION: ventana del recordatorio — ¿1h antes, la tarde previa, configurable?]
- **FR-012**: El sistema MUST enviar el **comprobante fiscal** por email tras una emisión AFIP exitosa, una sola vez, sin bloquear el flujo fiscal.
- **FR-013**: Cuando el canal es `email`/`both` y no hay email resoluble, el sistema MUST NOT romper; degrada según política. [NEEDS CLARIFICATION: ¿fallback a WhatsApp si hay teléfono, o solo registrar `skipped`?]
- **FR-014**: El operador/dueño MUST poder ver y cambiar `customer_channel` desde la configuración del negocio (UI).
- **FR-015**: El sistema MUST registrar cada intento (enviado/`failed`/`skipped` + motivo) para auditoría y reproceso, análogo a `whatsapp_outbox`.

### Key Entities *(include if feature involves data)*

- **businesses.customer_channel**: canal activo de aviso al cliente por negocio (`whatsapp|email|both`).
- **orders.customer_email / reservations.customer_email**: snapshot del email del cliente al momento de crear, denormalizado.
- **customer_message_log** (o `email_outbox`): registro de despachos al cliente con dedup por `(business_id, event, ref_id)` y estado (`sent|failed|skipped` + motivo). Habilita idempotencia y reproceso.
- **customer email templates**: plantillas por evento (subject + HTML), con overrides por negocio donde aplique (reusa `delivery_message_templates` para los estados de pedido).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un cliente que pide online recibe el aviso de cada estado notificable por email en el negocio configurado en `email`, sin intervención manual.
- **SC-002**: Cambiar `customer_channel` de `email` a `whatsapp` restaura el comportamiento previo sin cambios de código ni redeploy.
- **SC-003**: Cero regresiones para negocios en `whatsapp`: los flujos actuales se comportan idénticamente.
- **SC-004**: Reintentos de webhook no generan emails duplicados (0 duplicados por `(business_id, event, ref_id)`).
- **SC-005**: Ningún fallo de envío de email (rate limit, sin email, proveedor caído) rompe o bloquea la operación de salón/pedidos.
- **SC-006**: Un cliente que reserva recibe el acuse por email con los datos correctos y link de gestión.

## Double opt-in — en alcance (decisión 2026-07-15)

Se incorporó a pedido de Juan. El recordatorio (US4) incluye un link
`/reservar/confirmar/<confirm_token>` que setea `client_confirmed_at` (confirmación
de asistencia). Token opaco por reserva (`reservations.confirm_token`, migración
0010). La confirmación es por POST (form action), no por GET, para no confirmar
por prefetch de clientes de correo.

**La consecuencia dura** (auto-liberar/cancelar la mesa si no confirma) queda
**apagada por default**: auto-cancelar por un mail no clickeado es peligroso.
Hoy confirmar setea el flag + queda visible; el no-show sigue cerrando por tiempo.
Prender la consecuencia es una decisión de negocio posterior (flag + tocar el
no-show para mirar `client_confirmed_at`).

## Out of Scope *(no-goals de esta spec)*

- **Consecuencia dura del double opt-in**: liberar/revender la mesa automáticamente
  si el cliente no confirma. Requiere flag configurable + repensar el no-show y el
  timing. → Decisión de negocio posterior.
- **Elección del proveedor de email swappable** (Brevo/SES): esta spec usa Resend (ya integrado). Un segundo proveedor sería un adapter espejo en otra spec si el volumen lo exige.
- **Verificación del dominio en Resend** (carga de registros DNS): es acción operativa del cliente/infra, fuera del código.

## Assumptions

- El cliente de pedidos online y reservas se loguea con Google (Supabase Auth), por lo que `auth.users.email` está presente y verificado para esos flujos.
- Pedidos/reservas cargados por el staff a mano pueden no tener email; en ese caso el canal email simplemente no aplica a esa fila.
- Se reutiliza la infra de email existente (Resend, `sendEmail`) y la cuenta/API key ya configurada (`RESEND_API_KEY`); el `from`/dominio de transaccionales al cliente se define aparte del mail de cierre.
- El envío al cliente es best-effort y no transaccional respecto de la operación (igual que WhatsApp hoy).
- El destino final del canal sigue siendo WhatsApp (gateway propio GPSF cuando verifique en Meta); este puente convive como canal alternativo/fallback permanente.
