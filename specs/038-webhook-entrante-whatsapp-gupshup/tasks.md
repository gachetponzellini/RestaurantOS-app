# Tasks: Webhook entrante de WhatsApp (Gupshup) + bot en vivo

**Input**: `/specs/038-webhook-entrante-whatsapp-gupshup/` (spec.md + plan.md)

**Tests**: incluidos — TDD por constitución (principio II) para parser/auth/idempotencia.

**Depende de**: feature **037** (envío por Gupshup) implementada.

**Organización**: por user story · Formato `[ID] [P?] [Story] Descripción` · **[P]** = paralelizable.

> **Estado (2026-07-14): código de US1+US2 IMPLEMENTADO y verde.** `pnpm typecheck` OK · suite completa 606 passed.
> Hecho: `parseGupshupInbound` + `verifyGupshupToken` (en `whatsapp-gupshup.ts` + tests), migración `0006` (archivo), ruta `src/app/api/chatbot/whatsapp/[businessId]/route.ts` (auth por token timing-safe, parse, cross-check app, idempotencia, `after()`→`runChatbot(channel:"whatsapp")`→reply por `sendWhatsapp`), y su test de integración (token válido/ inválido, duplicado, media, message-event).
> **US3 (handoff) DIFERIDO**: depende de `chatbot_conversations.agent_enabled` (spec 32, aún no existe); la ruta ya deja el punto de enganche comentado y atiende siempre por ahora.
> Pendiente: **aplicar `0006` al cloud** (requiere OK), `db:types` (env logueado), y setear la callback URL en Gupshup (operación).

## Phase 1: Setup

- [ ] T001 Confirmar feature activa `038-...` + GitHub Issue del milestone. Verificar que 037 está mergeado (dependencia).

## Phase 2: Foundational (bloquea todas las stories)

- [ ] T002 Migración `supabase/migrations/0006_whatsapp_inbound.sql`: `whatsapp_credentials add column webhook_token text`; `create table whatsapp_inbound_events (...)` con `unique(business_id, provider_event_id)` + RLS service-role-only. (Squashable con `0005` si van juntas.)
- [ ] T003 Aplicar `0006` al cloud vía MCP + `get_advisors` sin alertas nuevas + `pnpm db:types`.
- [ ] T004 [P] Extender el port con la cara inbound en `src/lib/notifications/whatsapp-provider.ts` (`WhatsappInboundAdapter { verify, parse }`).

**Checkpoint**: datos + port inbound listos.

---

## Phase 3: User Story 1 — Cliente escribe, bot contesta (P1) 🎯 MVP

**Goal**: recibir un texto, correr el agente y responder por WhatsApp, multi-tenant por URL.

**Independent Test**: POST simulado del envelope Gupshup a la URL del negocio → agente corre con teléfono/negocio correctos → respuesta por `sendWhatsapp` + `200` rápido.

### Tests (rojo primero)

- [ ] T005 [P] [US1] `whatsapp-gupshup.test.ts`: `parseGupshupInbound` extrae de `type:"message"` el `phone`, `text`, `providerEventId`, `name`; distingue `message-event`/`user-event`; media → marca "no texto".

### Implementación

- [ ] T006 [US1] `src/lib/notifications/whatsapp-gupshup.ts`: `parseGupshupInbound(body)` → forma neutra `{ type, phone, name, text, providerEventId }`. Verde para T005.
- [ ] T007 [US1] Ruta `src/app/api/chatbot/whatsapp/[businessId]/route.ts` (`runtime="nodejs"`): parseo del envelope; si `type!=="message"` o media → ack `200`. Resuelve negocio por path.
- [ ] T008 [US1] Wiring: `after()` → `runChatbot({ businessId, businessSlug, businessName, channel:"whatsapp", contactIdentifier: normalizePhone(phone), contactDisplayName: name, userMessage: text })` → respuesta por `sendWhatsapp({ businessId, to: phone, text: assistantMessage })`. Manejar `ChatbotRateLimitedError` (ack, no responder) y `ChatbotNotConfiguredError` (log).
- [ ] T009 [US1] Test de integración de la ruta (agente mockeado): un `message` dispara `runChatbot` con canal/teléfono correctos y ackea `200`; media/`message-event` → ack sin invocar agente.

**Checkpoint**: US1 funcional — el bot atiende por WhatsApp.

---

## Phase 4: User Story 2 — Autenticidad + idempotencia (P2)

**Goal**: rechazar impostores; no duplicar en reintentos.

**Independent Test**: token inválido → 401; mismo id dos veces → un solo turno.

### Tests (rojo primero)

- [ ] T010 [P] [US2] `whatsapp-gupshup.test.ts`: `verifyGupshupToken` timing-safe (token correcto → true; ausente/incorrecto → false).

### Implementación

- [ ] T011 [US2] En la ruta: cargar `webhook_token` del negocio (service client) y verificar (header o `?token=`) **antes** de procesar; inválido → `401` fail-closed. Cross-check `body.app === app_name`; mismatch → `200` + log + descartar.
- [ ] T012 [US2] Idempotencia: `INSERT` en `whatsapp_inbound_events` (unique) antes de invocar el agente; violación 23505 → ack `200` sin reprocesar.
- [ ] T013 [US2] Tests de ruta: token inválido → 401; duplicado (mismo `payload.id`) → un solo `runChatbot`; `app` que no matchea → descartado.

**Checkpoint**: seguridad e idempotencia probadas; US1 sigue verde.

---

## Phase 5: User Story 3 — Handoff humano (P3)

**Goal**: con el agente apagado, persistir sin invocar el LLM.

**Independent Test**: `agent_enabled=false` → mensaje guardado, bot no responde.

- [ ] T014 [US3] En la ruta, antes del turno: si existe `chatbot_conversations.agent_enabled` y está `false` → persistir el entrante y **no** invocar el LLM; si la columna no existe aún → atender (default prendido).
- [ ] T015 [US3] Test: con agente apagado, `runChatbot` no se llama y el mensaje queda persistido.

**Checkpoint**: las 3 stories funcionales.

---

## Phase 6: Verify & cierre

- [ ] T016 `pnpm typecheck` + `pnpm test` en verde; lint sin warnings.
- [ ] T017 Revisión fresca: ningún secreto en código/tests/logs; el `webhook_token` nunca se expone; `get_advisors` sin alertas nuevas.
- [ ] T018 Documentar el contrato de la callback URL (para setear en Gupshup en operación) + actualizar feature page/wiki + marcar la spec + loggear; comentar + cerrar la Issue. Nota: desbloquea la bandeja de conversaciones y corrige el supuesto Meta del hardening previo.

---

## Dependencias

- **Phase 2 bloquea todo.** US2 (auth/idempotencia) endurece US1; US3 depende del flag de la bandeja (si no existe, no-op).
- **Fuera de esta feature**: DLR/estados reales (039). Los `message-event` acá se ackean y descartan.
- **Best-effort**: si el turno en background falla, no hay reintento (Gupshup ya recibió 200). Si el piloto lo exige → cola + cron (decisión abierta en el plan).

## Notas

- TDD: T005/T010 (parser, verify) van primero (rojo).
- El parser del envelope y el verify por token son lo **desechable** cuando llegue el gateway propio; el esqueleto de ruta, la idempotencia y el wiring con `runChatbot` se reutilizan.
