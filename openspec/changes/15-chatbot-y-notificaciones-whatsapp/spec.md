# Spec — 15-chatbot-y-notificaciones-whatsapp Chatbot (API key) y notificaciones WhatsApp configurables

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.
> Reglas transversales: dinero en **centavos**, **timezone AR**, scope **`business_id` + RLS**,
> mutaciones en Server Actions validadas con Zod. **Secretos**: jamás se guarda el valor de la API key
> de Anthropic ni de los tokens de WhatsApp/Meta — sólo su **ubicación, validación y estado**.

## ADDED Requirements

### Requisito: Exponer el estado de configuración del chatbot (API key)

El sistema DEBE indicar, por negocio, si el chatbot está **listo para responder** o si **falta configurar
la API key de Anthropic**, sin exponer nunca el valor de la key. El panel del chatbot
(`src/components/admin/chatbot-panel.tsx`) muestra ese estado y `src/lib/chatbot/agent.ts` lo verifica
antes de instanciar el modelo.

#### Escenario: La key está configurada y el bot responde

- **Dado** un negocio "House" con la API key de Anthropic presente (en env del deploy) y `chatbot_enabled = true`
- **Cuando** el encargado abre el panel del chatbot y prueba un mensaje
- **Entonces** el estado figura como "Listo" y el agente responde normalmente.

#### Escenario: Falta la key y el panel lo informa con claridad

- **Dado** un negocio sin la API key de Anthropic configurada
- **Cuando** el encargado abre el panel del chatbot y prueba un mensaje
- **Entonces** el panel muestra "Falta configurar la API key"
- **Y** `api/chatbot/test` devuelve un error **legible** ("falta API key"), no un 500 opaco
- **Y** en ningún momento se muestra ni se loguea el valor de la key.

### Requisito: Configurar preferencias de notificación por evento, destinatario y canal

El sistema DEBE permitir que `admin`/`encargado` configuren **quién recibe qué** y **por qué canal**
(`in_app` / `whatsapp`) para cada tipo de evento (`order.pending`, `mesa.transferred`, `mesa.cancelled`,
`comanda.entregada`, `delivery.status`, …), guardado en `notification_preferences` scopeado por
`business_id` con RLS. Los defaults reproducen el comportamiento actual.

#### Escenario: El dueño deja de recibir un tipo de aviso

- **Dado** el dueño de "House" que hoy recibe el aviso `order.pending`
- **Cuando** desactiva ese evento para su rol/usuario
- **Entonces** se persiste la preferencia (`enabled = false`) para `(business_id, order.pending, dueño)`
- **Y** deja de recibir esa notificación, sin afectar a otros destinatarios.

#### Escenario: El mozo no configura preferencias del negocio

- **Dado** un usuario con rol `mozo`
- **Cuando** intenta cambiar las preferencias de notificación
- **Entonces** la action responde error de permiso y no modifica datos.

#### Escenario: Un negocio no ve las preferencias de otro

- **Dado** preferencias configuradas en "House"
- **Cuando** un usuario de "Golf" lista las preferencias de notificación
- **Entonces** no aparecen las de "House" (RLS por `business_id`).

### Requisito: Enviar notificaciones del negocio por WhatsApp según preferencia

El sistema DEBE, cuando una preferencia marca el canal `whatsapp`, **encolar** la notificación del negocio
para envío por WhatsApp (`whatsapp_outbox`) además del feed in-app, sin bloquear la operación si el canal
no está conectado (best-effort, con `status` pending/sent/failed). El envío real depende de la cuenta de
Meta por local (cambio 14); sin ella, el canal queda en **stub** (no entrega, registra el motivo).

#### Escenario: Evento con canal WhatsApp se encola

- **Dado** la preferencia `comanda.entregada` con canal `whatsapp` activa para el encargado de "House"
- **Cuando** se dispara ese evento
- **Entonces** se crea una fila en `whatsapp_outbox` con el destinatario y el cuerpo del mensaje
- **Y** también queda la notificación in-app si la preferencia `in_app` está activa.

#### Escenario: Sin cuenta de Meta conectada no se rompe el flujo

- **Dado** un negocio sin WhatsApp/Meta conectado (cambio 14 pendiente)
- **Cuando** una notificación con canal `whatsapp` se encola
- **Entonces** la fila de `whatsapp_outbox` queda en `failed`/`pending` con motivo "WhatsApp no conectado"
- **Y** la operación que originó el evento **no falla** por eso.

### Requisito: Notificar al cliente por WhatsApp en cada cambio de estado de delivery

El sistema DEBE enviar un mensaje de WhatsApp al **teléfono del cliente** en las transiciones de estado del
pedido de delivery, usando **plantillas configurables por estado** y respetando el `delivery_type`. El
estado "nuevo" corresponde a cuando el cliente cargó el pedido y el bot ya respondió que lo toma; el primer
mensaje de estado se envía al pasar a `preparing`. Se apoya en las transiciones de
`src/lib/orders/status.ts` y se dispara desde `src/lib/orders/update-status.ts`.

#### Escenario: Delivery avanza de estado y el cliente recibe avisos

- **Dado** un pedido de **delivery** de "House" con teléfono del cliente cargado, en estado `confirmed`
- **Cuando** el local lo pasa a `preparing`, luego `ready`, luego `on_the_way`, luego `delivered`
- **Entonces** en cada transición se encola un WhatsApp al cliente con la plantilla del estado
  correspondiente ("preparando", "listo", "en camino", "entregado").

#### Escenario: Take-away no recibe "en camino"

- **Dado** un pedido **take-away** (retiro en local)
- **Cuando** avanza por sus estados hasta `delivered`
- **Entonces** no se envía el mensaje "en camino" (ese estado no aplica al retiro)
- **Y** sí se envían los mensajes de "preparando"/"listo"/"entregado" si están configurados.

#### Escenario: Sin teléfono del cliente no se intenta enviar

- **Dado** un pedido de delivery sin teléfono de cliente válido
- **Cuando** cambia de estado
- **Entonces** no se encola WhatsApp para ese pedido (se omite, sin error), y el cambio de estado se aplica
  igual.

## MODIFIED Requirements

### Requisito: Resolver destinatarios y canal de las notificaciones desde las preferencias

Hoy `createNotification(...)` (`src/lib/notifications/create.ts`) inserta una fila in-app con el
`user_id`/`target_role` **fijo que pasa cada call-site** (`src/lib/mozo/actions.ts`,
`src/lib/comandas/actions.ts`). El comportamiento cambia: `createNotification` DEBE **consultar
`notification_preferences`** para decidir a qué destinatarios y por qué canales (`in_app`/`whatsapp`)
entregar el evento, manteniendo back-compat vía defaults equivalentes al ruteo actual.

#### Escenario: El ruteo deja de estar hardcodeado en el call-site

- **Dado** un evento `mesa.transferred` que hoy notifica al encargado por `target_role` fijo
- **Cuando** se emite con el nuevo `createNotification`
- **Entonces** los destinatarios y canales salen de `notification_preferences` del negocio
- **Y** con los defaults vigentes, el encargado sigue recibiendo el aviso in-app (sin regresión).

#### Escenario: Default back-compat cuando no hay preferencia explícita

- **Dado** un negocio sin preferencias configuradas para un evento
- **Cuando** ese evento se dispara
- **Entonces** se aplica el **default** que reproduce el comportamiento actual (in-app al rol que hoy lo
  recibe), sin perder el aviso.

### Requisito: Devolver un error legible cuando el chatbot no está configurado

Hoy `api/chatbot/test` (`src/app/api/chatbot/test/route.ts`) captura cualquier fallo del agente y responde
**500 con el mensaje crudo**. El comportamiento cambia: cuando el motivo es **falta de API key / chatbot
deshabilitado**, DEBE responder un error claro y accionable, distinguible de un fallo genérico, para que el
panel guíe a "configurar la key".

#### Escenario: Probar el bot sin key da un mensaje accionable

- **Dado** un negocio sin API key configurada
- **Cuando** el encargado prueba el bot desde el panel
- **Entonces** la respuesta indica explícitamente que **falta configurar la API key** (no un 500 genérico)
- **Y** el valor de la key nunca aparece en la respuesta ni en logs.
