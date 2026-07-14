# Feature Specification: Proveedor de WhatsApp swappable + envío por Gupshup

**Feature Branch**: `037-proveedor-whatsapp-swappable-gupshup`

**Created**: 2026-07-14

**Status**: Draft

**Input**: Gupshup como **puente temporal** de WhatsApp. 360dialog fue descartado; el destino final es el gateway propio GPSF (trabado en verificación de Meta). Se conecta Gupshup ahora sin acoplar el sistema, para volver al gateway después a bajo costo. Base: [proposal en el Brain](../../../../wiki/specs/37-proveedor-whatsapp-swappable-gupshup/proposal.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El negocio envía WhatsApp por Gupshup (Priority: P1) 🎯 MVP

Un negocio con Gupshup configurado envía sus mensajes de WhatsApp (texto de sesión y templates aprobados) a través de Gupshup, usando **sus** credenciales. Los avisos que ya existen (estados de delivery, reserva confirmada, notificaciones internas, campañas) siguen funcionando sin cambios en su código: solo cambia el proveedor por debajo.

**Why this priority**: es el valor central y desbloquea el go-live del piloto sin esperar al gateway propio. Sin esto, WhatsApp no sale.

**Independent Test**: configurar Gupshup en un negocio de prueba y disparar un aviso de delivery; verificar que se hace el `POST` a Gupshup con las credenciales de ese negocio y que la fila de `whatsapp_outbox` queda `sent` con el `provider_message_id` devuelto.

**Acceptance Scenarios**:

1. **Dado** un negocio con credenciales de Gupshup cargadas y un aviso que encola un WhatsApp de **texto**, **Cuando** se procesa el envío, **Entonces** se hace el `POST` a Gupshup con la key del negocio y la fila de `whatsapp_outbox` queda `sent` con `provider_message_id`.
2. **Dado** un aviso **proactivo** con su template aprobado (delivery/reserva), **Cuando** se envía, **Entonces** se manda como **template** (identificado por su id de Gupshup + params en orden), no como texto libre.
3. **Dado** un aviso proactivo cuya plantilla **no tiene** id de Gupshup mapeado, **Cuando** se intenta enviar, **Entonces** la fila queda `failed` con motivo claro y **no** se manda texto libre a ciegas.
4. **Dado** un negocio **sin** credenciales de Gupshup, **Cuando** se encola un WhatsApp, **Entonces** la fila queda `failed` con "WhatsApp no conectado" y la operación que originó el aviso **no** falla.
5. **Dado** que Gupshup responde un error (rate-limit, timeout, saldo), **Cuando** se intenta el envío, **Entonces** la fila queda `failed` con el motivo **saneado** (sin filtrar la key) y la operación de origen no se rompe.

---

### User Story 2 - Proveedor seleccionable por negocio, sin tocar a los consumidores (Priority: P2)

La plataforma puede tener un negocio en Gupshup y otro en 360dialog (y mañana el gateway propio) al mismo tiempo, eligiendo el proveedor **por negocio**. Los ~6 lugares del sistema que envían WhatsApp no conocen al proveedor: llaman a un único contrato y el sistema resuelve el adapter correcto.

**Why this priority**: es lo que hace que Gupshup sea un puente **temporal** y no una reescritura; volver al gateway propio es agregar un adapter y cambiar un valor, no tocar el sistema.

**Independent Test**: con dos negocios, uno `provider=gupshup` y otro `provider=360dialog`, disparar el mismo tipo de aviso en cada uno y verificar que cada uno pega al endpoint de **su** proveedor, sin cambios en el código de los consumidores.

**Acceptance Scenarios**:

1. **Dado** el negocio A con `provider=gupshup` y el negocio B con `provider=360dialog`, **Cuando** cada uno envía un WhatsApp, **Entonces** A pega a Gupshup y B a 360dialog, cada uno con **sus** credenciales.
2. **Dado** el contrato de envío único, **Cuando** se agrega el adapter Gupshup, **Entonces** los consumidores existentes (delivery, campañas, notificaciones internas) **no cambian** su código ni su contrato.
3. **Dado** un negocio, **Cuando** se cambia su `provider`, **Entonces** el envío pasa a hacerse por el nuevo proveedor sin redeploy de lógica de negocio ni cambios en los call-sites.

---

### User Story 3 - El admin configura y prueba Gupshup por local (Priority: P3)

El admin de un local carga las credenciales de Gupshup (número/app name) y prueba la conexión, viendo "conectado: sí/no" sin que el valor del secreto se muestre nunca.

**Why this priority**: necesario para operar, pero después del camino de envío; se puede sembrar la config a mano al principio.

**Independent Test**: cargar credenciales de Gupshup desde la pantalla de admin de un local, tocar "enviar mensaje de prueba" y verificar que llega, sin que el valor de la key aparezca en pantalla, logs ni respuestas.

**Acceptance Scenarios**:

1. **Dado** un admin en la config de WhatsApp de su local, **Cuando** carga app name + credenciales de Gupshup y elige el proveedor, **Entonces** el estado pasa a "conectado: sí" y el valor del secreto nunca se expone.
2. **Dado** un usuario sin rol de admin/plataforma, **Cuando** intenta cargar o leer las credenciales, **Entonces** la operación se rechaza (RLS/permiso) y no ve el secreto.
3. **Dado** House y Golf como negocios separados, **Cuando** cada uno carga su propia app/número, **Entonces** cada negocio queda con credenciales propias y el envío de uno nunca usa la key del otro.

### Edge Cases

- Un template mandado por el endpoint de sesión (o viceversa) → error del proveedor; el adapter elige el endpoint según haya texto o template.
- `200 {status:"submitted"}` de Gupshup significa **aceptado**, no **entregado**: las fallas por saldo/opt-in/fuera-de-ventana llegan después por evento asíncrono (fuera de esta feature; ver 039).
- Teléfono del destinatario en formatos varios → se normaliza a E.164 sin `+` antes de enviar.
- Negocio con `provider` desconocido/no soportado → error claro, no se intenta enviar.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE exponer un **contrato de envío único** (`sendWhatsapp({ businessId, to, text?, template? })`) cuya firma y resultado **no cambian** al sumar un proveedor.
- **FR-002**: El sistema DEBE seleccionar el proveedor de envío **por negocio**, a partir de un discriminador persistido por negocio (columna `provider`), soportando al menos `gupshup` y `360dialog`, y previendo `gateway`.
- **FR-003**: El adapter de Gupshup DEBE enviar **texto de sesión** por su endpoint de sesión, con autenticación por header de API key y cuerpo **form-urlencoded**, incluyendo el mensaje como contenido serializado.
- **FR-004**: El adapter de Gupshup DEBE enviar **templates** por su endpoint de template, identificando la plantilla por **id del proveedor** + parámetros **posicionales**.
- **FR-005**: El sistema DEBE resolver el **id de template del proveedor** a partir del nombre lógico + idioma, por negocio y proveedor; si no hay id mapeado, **no** envía y registra el motivo.
- **FR-006**: El sistema DEBE reflejar el resultado del envío en la cola (`sent` con marca de tiempo + id de mensaje del proveedor, o `failed` con motivo **saneado**).
- **FR-007**: El sistema DEBE tratar el envío como **best-effort**: un fallo del proveedor nunca rompe la operación de negocio que originó el aviso.
- **FR-008**: El sistema NUNCA DEBE loguear, devolver al cliente ni exponer el valor de la API key ni de ningún secreto del proveedor; la UI solo ve el **estado** "conectado".
- **FR-009**: Los consumidores existentes de envío (estados de delivery, campañas, notificaciones internas, verificación de cuenta) DEBEN seguir funcionando **sin cambios** en su código.
- **FR-010**: El sistema DEBE mantener el aislamiento **multi-tenant**: cada negocio usa exclusivamente sus credenciales; nunca una key global compartida entre locales.
- **FR-011**: La carga de credenciales del proveedor DEBE estar restringida a rol admin/plataforma; los secretos viven en almacenamiento **service-role-only** (no legible por members).
- **FR-012**: El adapter de Gupshup DEBE ser **lógica pura y testeable** para armar el request y parsear la respuesta (sin red en los tests).

### Key Entities *(include if feature involves data)*

- **Credenciales de WhatsApp por negocio**: discriminador de proveedor + API key + número/identidad de emisor + (Gupshup) nombre de app. Service-role-only. Una fila por negocio.
- **Mapa de templates**: por (negocio, proveedor, nombre de template, idioma) → id de template del proveedor. Cubre orígenes varios (delivery, reserva, campañas, verificación).
- **Cola de salida (existente)**: registra estado del envío (`pending`/`sent`/`failed`), motivo y id de mensaje del proveedor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un aviso de delivery en un negocio con Gupshup configurado sale por Gupshup y queda registrado como `sent` con id de mensaje, en el camino feliz, sin intervención manual.
- **SC-002**: Cambiar el proveedor de un negocio (gupshup ↔ 360dialog) **no** requiere ningún cambio en los ~6 call-sites de envío ni en su contrato.
- **SC-003**: El valor de la API key **no aparece** en ningún log, respuesta HTTP, mensaje de error ni en la UI, verificado por revisión + tests.
- **SC-004**: Un aviso proactivo sin template mapeado **nunca** se envía como texto libre (0 casos), quedando `failed` con motivo claro.
- **SC-005**: Un fallo del proveedor (timeout/rate-limit) deja la operación de negocio de origen intacta (la mesa/pedido/notificación se completa igual).

## Assumptions

- El contrato `sendWhatsapp` y la tabla de credenciales por negocio (con columna `provider`, default `360dialog`) **ya existen** (implementación previa de 360dialog); esta feature agrega el adapter Gupshup y el mapeo de templates, no reescribe el contrato.
- El **alta operativa** en Gupshup (crear la cuenta/app, portar el número, dar de alta y aprobar los templates en Meta, capturar opt-in) es responsabilidad de operación, fuera de esta feature. Se consumen templates ya aprobados por id.
- El **webhook entrante** (recibir mensajes y que el bot conteste) y los **estados de entrega reales** (DLR) son features aparte (038 y 039).
- Los templates de fase 1 son de **solo texto** (sin header multimedia ni botones dinámicos).
- Dinero, timezone AR, RLS y secretos se rigen por la constitución del proyecto.
