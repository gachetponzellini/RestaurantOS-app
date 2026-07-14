# Implementation Plan: Webhook entrante de WhatsApp (Gupshup) + bot en vivo

**Branch**: `038-webhook-entrante-whatsapp-gupshup` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/038-webhook-entrante-whatsapp-gupshup/spec.md`

## Summary

Crear la ruta entrante `POST /api/chatbot/whatsapp/[businessId]` que recibe los mensajes de Gupshup, los autentica con un **token compartido por negocio** (Gupshup no firma), deduplica por id de mensaje, ackea `200` rápido y corre el agente (`runChatbot`, canal `whatsapp`) en **background** (`after()`), respondiendo por el `sendWhatsapp` de 037. Multi-tenant por `businessId` en la URL (una App = un número = una URL). Supera el supuesto Meta/HMAC del diseño previo; desbloquea la bandeja de conversaciones.

## Technical Context

**Language/Version**: TypeScript 5 · Next.js 15.5 Route Handler, `runtime = "nodejs"`, `after()` para background.

**Primary Dependencies**: `@supabase/supabase-js` (service client), `node:crypto` (`timingSafeEqual`), `runChatbot` existente, `sendWhatsapp` (037).

**Storage**: Supabase. `whatsapp_credentials` (+ `webhook_token`, nuevo), `whatsapp_inbound_events` (nuevo), `chatbot_contacts/conversations/messages` (existen, service-role-only).

**Testing**: Vitest — parser del envelope, verificación de token, idempotencia, ruteo por tipo; el turno del agente se mockea.

**Target Platform**: Vercel serverless. Ack inmediato + `after()`.

**Project Type**: Web app (Route Handler + módulo de dominio).

**Performance/Constraints**: ack en <10s (presupuesto de Gupshup); el LLM corre fuera del request. Fail-closed en auth.

**Scale/Scope**: piloto (2 negocios, 2 Apps/URLs). Volumen bajo.

## Constitution Check

- **I. Multi-tenancy estricto** ✅ — negocio por `businessId` de la URL + cross-check de identidad; tablas de conversación siguen deny-all (service-role).
- **II. Test-First** ✅ — parser, verify de token e idempotencia son lógica pura → TDD. Toca la máquina de conversación → gate de design aplicado (abajo).
- **III. Server Actions + Zod** ✅/adaptado — es una Route Handler (webhook), no server action; valida el payload y corre con service client. Sin escritura desde cliente.
- **IV. Centavos + timezone AR** N-A — no toca dinero; timestamps como hoy.
- **V. Secretos server-only** ✅ — `webhook_token` service-role-only; nunca en logs/errores. El `verifyWhatsappSignature` (HMAC Meta) NO se usa.
- **VI. Spec-Driven + approval gate** ✅.
- **VII. Migraciones versionadas** ✅ — migración `0006` + `pnpm db:types`.
- **Gate de design (estados de conversación + auth/identidad + multi-tenant + integración externa)** ✅ — documentado abajo.

**Resultado**: PASS.

## Project Structure

```text
specs/038-webhook-entrante-whatsapp-gupshup/
├── spec.md · plan.md · tasks.md

src/app/api/chatbot/whatsapp/[businessId]/route.ts   # NUEVO: POST (auth, parse, idempotencia, after→runChatbot→reply)
src/lib/notifications/whatsapp-gupshup.ts            # MOD: + parseGupshupInbound() + verifyGupshupToken()
src/lib/notifications/whatsapp-provider.ts           # MOD: + cara inbound del port (WhatsappInboundAdapter)
supabase/migrations/0006_whatsapp_inbound.sql        # NUEVO: whatsapp_credentials.webhook_token + tabla whatsapp_inbound_events
```

**Structure Decision**: espejo del webhook multi-tenant de la casa (`src/app/api/mp/webhook/route.ts`): negocio por parámetro de URL, credenciales por service client, fail-closed, idempotencia. El parser/verify de Gupshup queda aislado en el adapter para que el gateway propio solo reemplace esa parte.

## Design / Decisiones técnicas

### D1 — Auth por token, no HMAC (verificado)
Gupshup **no firma** el webhook (no hay `X-Hub-Signature-256`; la doc solo menciona IP whitelisting + endpoint público). Auth = `webhook_token` por negocio, entregado por Gupshup como header (vía el `meta` de su Set Subscription) o `?token=` en la URL. Comparación timing-safe → `401` si falla. `verifyWhatsappSignature` (spec 20, HMAC Meta) queda **reservado** para el gateway propio, no se usa acá.

### D2 — Multi-tenant por URL
Una App Gupshup = un número = una URL. `businessId` va en el **path** (`/api/chatbot/whatsapp/[businessId]`). House y Golf = dos Apps = dos URLs = dos filas de credenciales. Cross-check defensivo: `body.app === whatsapp_credentials.app_name`; mismatch → `200` + log + descartar.

### D3 — Envelope Gupshup
`{ app, timestamp, type, payload }`. `type==="message"` → `sender.phone` + `payload.payload.text`. `type==="message-event"` (DLR) → ack + descartar (→ 039). `type==="user-event"/"system-event"` → ack + ignorar. Media → fase 1 no procesa.

### D4 — Ack rápido + `after()`
Responder `200` de inmediato; correr `runChatbot({ channel:"whatsapp", contactIdentifier: normalizePhone(sender.phone), ... })` en `after()`. La respuesta sale por `sendWhatsapp({ text })` (texto de sesión — ventana de 24h abierta porque el cliente acaba de escribir). `ChatbotRateLimitedError` → ack, no responder. `ChatbotNotConfiguredError` → log, no responder. **Riesgo**: si el background falla, no hay reintento (best-effort) — ver Complexity/riesgos.

### D5 — Idempotencia
`INSERT` en `whatsapp_inbound_events (business_id, provider, provider_event_id)` con `UNIQUE(business_id, provider_event_id)` = `payload.id`. Violación 23505 → ya procesado → ack `200`. Mismo patrón que la carrera de `getOrOpenConversation`.

### D6 — Handoff
Si existe `chatbot_conversations.agent_enabled` (de la feature de bandeja) y está `false` → persistir el mensaje, no invocar LLM. Si no existe aún → atender siempre.

## Data model (migración `0006`)

- `whatsapp_credentials`: `add column webhook_token text` (server-only; comentario "secreto del callback — Gupshup no firma").
- `whatsapp_inbound_events`: `(id, business_id, provider, provider_event_id, type, received_at, unique(business_id, provider_event_id))`, RLS service-role-only (sin policy para `authenticated`).
- `pnpm db:types` tras aplicar al cloud.
- **Nota**: puede squashearse con `0005` de 037 si ambas features aterrizan en el mismo PR.

## Complexity Tracking

| Decisión | Por qué | Alternativa descartada |
|---|---|---|
| `after()` best-effort (no cola+cron) | Suficiente para el volumen del piloto; menos infra | Cola persistida + cron: más robusto pero sobra para el piloto — se suma si hace falta |
| Auth por token (no HMAC) | Gupshup no firma; es lo que ofrece el proveedor | HMAC de Meta: no aplica a Gupshup |
