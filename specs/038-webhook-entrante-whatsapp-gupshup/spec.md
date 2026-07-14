# Feature Specification: Webhook entrante de WhatsApp (Gupshup) + el bot contesta en vivo

**Feature Branch**: `038-webhook-entrante-whatsapp-gupshup`

**Created**: 2026-07-14

**Status**: Draft

**Input**: El agente de reservas está completo pero solo corre en modo test; falta la **puerta de entrada** para que el cliente le escriba por WhatsApp y el bot conteste por WhatsApp productivo, vía Gupshup. Depende de 037 (envío). Base: [proposal en el Brain](../../../../wiki/specs/38-webhook-entrante-whatsapp-gupshup/proposal.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El cliente escribe y el bot contesta por WhatsApp (Priority: P1) 🎯 MVP

Un cliente le manda un WhatsApp al número del local; el sistema recibe el mensaje, corre el agente de reservas y le responde por WhatsApp, todo scopeado al negocio dueño de ese número.

**Why this priority**: es el objetivo del pedido ("recibir y enviar por WhatsApp"). Sin esto, el bot no atiende clientes reales.

**Independent Test**: enviar (o simular) un mensaje entrante de Gupshup a la URL del negocio y verificar que se corre el agente con el teléfono/negocio correctos y que sale una respuesta por el envío de 037, con `200` rápido.

**Acceptance Scenarios**:

1. **Dado** un negocio con su número de Gupshup conectado, **Cuando** un cliente le manda un texto, **Entonces** el sistema resuelve el negocio por la URL, corre el agente con el teléfono del cliente como identificador y responde por WhatsApp.
2. **Dado** que el agente puede tardar, **Cuando** llega el mensaje, **Entonces** el sistema **ackea `200` de inmediato** y procesa el turno en background (para respetar el presupuesto de tiempo de Gupshup).
3. **Dado** un cliente que manda **media** (foto/audio), **Cuando** llega, **Entonces** el sistema no rompe: responde que por ahora solo procesa texto (o lo ignora) y ackea `200`.
4. **Dado** un evento entrante que **no** es mensaje (estado de entrega, opt-in), **Cuando** llega, **Entonces** se ackea `200` y no se invoca el agente.

---

### User Story 2 - Solo se procesan requests auténticos y una sola vez (Priority: P2)

El webhook rechaza requests que no provienen de Gupshup y nunca procesa dos veces el mismo mensaje, aunque Gupshup reintente.

**Why this priority**: sin firma criptográfica de Gupshup, la autenticidad depende de un secreto por negocio; y los reintentos exigen idempotencia para no duplicar respuestas/reservas.

**Independent Test**: mandar el mismo mensaje dos veces (mismo id) y con token inválido; verificar 401 en el impostor y un solo turno del bot en el duplicado.

**Acceptance Scenarios**:

1. **Dado** un request **sin** el token secreto del negocio o con uno incorrecto, **Cuando** llega, **Entonces** se responde `401` y **no** se procesa (fail-closed).
2. **Dado** un mensaje ya procesado (mismo id de mensaje), **Cuando** Gupshup lo reintenta, **Entonces** se ackea `200` **sin** volver a correr el agente ni reenviar respuesta.
3. **Dado** un request cuyo `app`/identidad **no coincide** con las credenciales del negocio de la URL, **Cuando** llega, **Entonces** se descarta (ack `200` + log) sin procesar.

---

### User Story 3 - Handoff humano: si el agente está apagado, no contesta el bot (Priority: P3)

Cuando una conversación fue tomada por una persona (agente apagado desde la bandeja), el webhook persiste el mensaje entrante pero **no** invoca al bot.

**Why this priority**: evita que el bot se cruce con el staff. Depende de la bandeja (feature separada) para el toggle; si aún no existe, el bot atiende siempre.

**Independent Test**: con el flag de agente en `false` para una conversación, mandar un mensaje y verificar que se guarda pero el LLM no corre.

**Acceptance Scenarios**:

1. **Dado** una conversación con el agente **apagado**, **Cuando** el cliente escribe, **Entonces** el mensaje se persiste y el bot **no** responde.
2. **Dado** que el toggle de agente aún no existe en el sistema, **Cuando** llega un mensaje, **Entonces** el bot atiende normalmente (default: agente prendido).

### Edge Cases

- El agente lanza rate-limit para ese contacto/negocio → se ackea `200` y no se responde (protección de costo ya existente).
- El agente no está configurado (falta API key) → se loguea y no se responde, sin romper.
- El turno del bot falla en background después del `200` → el cliente no recibe respuesta y Gupshup no reintenta (best-effort; ver riesgos del plan).
- Teléfono del cliente en formato AR (celular 549…) → se normaliza para que matchee reservas previas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE exponer un endpoint entrante **por negocio** (con el identificador de negocio en la URL) que reciba los POST de Gupshup.
- **FR-002**: El sistema DEBE **autenticar** cada request entrante con un **secreto compartido por negocio** (no hay firma criptográfica de Gupshup), con comparación **timing-safe**; request inválido → `401`, fail-closed.
- **FR-003**: El sistema DEBE resolver el negocio por el identificador de la URL y **verificar** que la identidad del request (app) corresponde a ese negocio; si no, descartar sin procesar.
- **FR-004**: El sistema DEBE parsear el **envelope propio de Gupshup** y distinguir mensajes de cliente vs eventos de estado/usuario; solo los mensajes de texto disparan el agente.
- **FR-005**: El sistema DEBE ser **idempotente** por id de mensaje entrante: un reintento del mismo mensaje no vuelve a procesarse.
- **FR-006**: El sistema DEBE **ackear `2xx` rápido** y ejecutar el turno del agente en **background**, para respetar el presupuesto de tiempo del proveedor.
- **FR-007**: El sistema DEBE correr el agente existente con canal WhatsApp, usando el **teléfono verificado** del remitente como identificador de contacto, y **responder** por el envío de la feature 037.
- **FR-008**: El sistema DEBE respetar el estado de **handoff** de la conversación (si el agente está apagado, persistir el mensaje y no invocar el LLM); si ese estado no existe aún, el bot atiende.
- **FR-009**: El sistema DEBE manejar media entrante sin romper (fase 1: no procesar; responder/ignorar) y ackear.
- **FR-010**: El sistema NUNCA DEBE exponer el secreto del webhook; vive server-only por negocio.
- **FR-011**: El sistema DEBE mantener las tablas de conversación como **service-role-only** (sin acceso desde cliente), coherente con el diseño existente.

### Key Entities *(include if feature involves data)*

- **Secreto de webhook por negocio**: token compartido para validar autenticidad. Server-only, junto a las credenciales del proveedor.
- **Evento entrante (idempotencia)**: registro por (negocio, id de mensaje del proveedor) para deduplicar reintentos.
- **Conversación/contacto/mensajes (existentes)**: el agente persiste el hilo; gana (de otra feature) un flag de handoff opcional.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un cliente que manda un texto al número del local recibe una respuesta del bot por WhatsApp en el camino feliz, con el negocio correcto.
- **SC-002**: Un request sin token válido se rechaza con `401` en el 100% de los casos; ningún impostor dispara el agente.
- **SC-003**: Un mensaje reintentado por Gupshup produce **exactamente un** turno del agente y **una** respuesta (0 duplicados).
- **SC-004**: El endpoint ackea en tiempo dentro del presupuesto del proveedor (respuesta inmediata; el trabajo del LLM no bloquea el ack).
- **SC-005**: Con el agente apagado en una conversación, 0 respuestas del bot; el mensaje igual queda persistido.

## Assumptions

- La feature **037** (envío por Gupshup) está implementada: `sendWhatsapp` responde por Gupshup y las credenciales por negocio existen.
- El agente (`runChatbot`) ya soporta el canal WhatsApp y trae rate-limit e índice de conversación única por contacto (de features previas); esta feature **no** reescribe el agente, solo lo cablea.
- El **estado de entrega real** (delivered/read/failed) es otra feature (039); acá los eventos de estado se ackean y descartan.
- La **bandeja de conversaciones** y su UI de handoff son otra feature; esta solo respeta el flag si existe.
- El **alta operativa** (setear la callback URL en Gupshup, opt-in) es operación, fuera de código.
- Se arranca con procesamiento **best-effort** en background (sin cola+cron); si el piloto lo exige, se evalúa la cola después.
