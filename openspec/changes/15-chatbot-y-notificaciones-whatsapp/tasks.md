# Tareas — 15-chatbot-y-notificaciones-whatsapp Chatbot (API key) y notificaciones WhatsApp configurables

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.
> Dinero en centavos, timezone AR, scope `business_id` + RLS, mutaciones en Server Actions con Zod.
> **Secretos**: nunca el valor de la API key de Anthropic ni de los tokens de WhatsApp en código/tests/specs
> — sólo ubicación, validación y estado. La última migración real es `0051`; usar placeholder `00NN_*`.

## 1. Datos

- [ ] Migración `supabase/migrations/00NN_notification_prefs_y_whatsapp.sql`:
  - [ ] `notification_preferences (id, business_id, event_type, target_role, target_user_id, channel,
        enabled, created_at, updated_at)` — `channel in ('in_app','whatsapp')`,
        `(target_role is not null) or (target_user_id is not null)`, unicidad por
        `(business_id, event_type, target_role, target_user_id, channel)`, índice por `(business_id, event_type)`.
  - [ ] `whatsapp_outbox (id, business_id, to_phone, body, kind, ref_id, status, error, created_at, sent_at)`
        — `status in ('pending','sent','failed')`, índices por `(business_id, status)` y `kind`.
  - [ ] `alter table public.chatbot_configs add column chatbot_enabled boolean not null default false`
        (+ columnas de **referencia** a credenciales de WhatsApp por negocio si se decide guardarlas acá,
        siguiendo el patrón `mp_*` de `0011` — **sin valores**, a decidir con la 1ª pregunta abierta).
  - [ ] Plantillas de delivery: columna JSON en `chatbot_configs` **o** tabla
        `delivery_message_templates (business_id, status, body, enabled)` (elegir una; preferir JSON si es
        un set chico).
  - [ ] RLS `members_*` + `platform_*` por `business_id` en `notification_preferences` y `whatsapp_outbox`.
        Insert de outbox sólo vía service-role (como `notifications`, `0029`).
- [ ] `pnpm db:types` → `src/lib/supabase/database.types.ts`.

## 2. Dominio (TDD)

### 2a. Estado del chatbot / API key
- [ ] Test (rojo): `src/lib/chatbot/<config-state>.test.ts` — `chatbotReady(business)` =
      (key presente en env **y** `chatbot_enabled`); nunca expone el valor.
- [ ] Implementar el chequeo y usarlo en `src/lib/chatbot/agent.ts` antes de instanciar `ChatAnthropic`
      (hoy `agent.ts:1546`): si no está listo, error tipado "falta API key / chatbot deshabilitado".
- [ ] `src/app/api/chatbot/test/route.ts` — mapear ese error a una respuesta legible (no 500 genérico).
- [ ] `src/app/api/chatbot/config/route.ts` — agregar `chatbotReady`/`enabled` al GET (sin el valor de la key).

### 2b. Preferencias de notificación
- [ ] Test (rojo): `src/lib/notifications/<prefs>.integration.test.ts` — alta/edición por evento×destinatario×canal,
      unicidad, RLS por negocio, permiso `admin`/`encargado`; defaults back-compat.
- [ ] `src/lib/notifications/<prefs>.ts` (lógica pura: resolver destinatarios+canales para un evento dado,
      aplicando defaults) + Server Actions de gestión en `src/lib/notifications/actions.ts` (Zod + `can.ts`).

### 2c. Ruteo de createNotification + canal WhatsApp
- [ ] Test (rojo): `src/lib/notifications/create.test.ts` — `createNotification` consulta preferencias,
      crea in-app cuando corresponde y **encola en `whatsapp_outbox`** cuando el canal es `whatsapp`;
      best-effort (no lanza si WhatsApp no está conectado).
- [ ] Refactor `src/lib/notifications/create.ts` para resolver desde preferencias (mantener firma usable por
      los call-sites de `src/lib/mozo/actions.ts` y `src/lib/comandas/actions.ts`).
- [ ] Stub de canal WhatsApp reutilizando el patrón de `src/lib/campaigns/channels.ts` (`wabaChannel`):
      sin cuenta de Meta → `failed/pending` con motivo, sin romper la operación.

### 2d. WhatsApp al cliente por estado de delivery (lógica pura)
- [ ] Test (rojo): `src/lib/notifications/<delivery-templates>.test.ts` — dado `(from→to, delivery_type,
      plantilla, datos del pedido)` produce el mensaje correcto; take-away omite `on_the_way`; sin teléfono
      no produce mensaje; horarios/ETA en timezone AR.
- [ ] `src/lib/notifications/<delivery-templates>.ts` (pura) — render por estado con placeholders.
- [ ] Enganchar en `src/lib/orders/update-status.ts`: tras una transición válida de `status.ts`, encolar el
      WhatsApp del cliente (best-effort, no bloquea el cambio de estado). Considerar también el "nuevo" en el
      alta (`persist-order.ts`) según la 6ª pregunta abierta.

### 2e. Permisos
- [ ] Agregar `canManageNotificationPrefs` (o reutilizar el check de settings) en
      `src/lib/permissions/can.ts` para `admin`/`encargado`.

## 3. UI

- [ ] `src/components/admin/chatbot-panel.tsx` — badge de estado "Listo / Falta configurar la API key"
      (consumiendo `chatbotReady` del GET de `api/chatbot/config`). Sin mostrar el valor de la key.
- [ ] UI de **preferencias de notificación** del dueño (matriz evento × destinatario × canal) en
      `src/components/notifications/*` o `src/components/admin/settings/*`, consumiendo las actions.
- [ ] (Si editables) UI de **plantillas de delivery** por estado con placeholders.

## 4. Verify

- [ ] `pnpm typecheck` y `pnpm test` en verde.
- [ ] Revisión fresca de archivos tocados; confirmar que **ningún secreto** quedó en código/tests/logs.
- [ ] Marcar ✅ en `openspec/changes/README.md`.
