# Implementation Plan: Proveedor de WhatsApp swappable + envío por Gupshup

**Branch**: `037-proveedor-whatsapp-swappable-gupshup` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/037-proveedor-whatsapp-swappable-gupshup/spec.md`

## Summary

Sumar **Gupshup** como proveedor de envío de WhatsApp detrás del contrato ya existente `sendWhatsapp`, seleccionado **por negocio** vía `whatsapp_credentials.provider`. Se introduce un **port de proveedor** (`WhatsappOutboundAdapter`), el adapter 360dialog actual pasa a ser una implementación del port, y se agrega un **adapter Gupshup** (form-urlencoded, header `apikey`, `message` como JSON-string; template por id+params). Un **mapa de templates** resuelve `nombre→id de Gupshup`. Cero cambios en los ~6 consumidores. Gupshup es puente temporal: el gateway propio será el tercer adapter.

## Technical Context

**Language/Version**: TypeScript 5 · Next.js 15.5 (App Router) · React 19 · Node runtime para el envío.

**Primary Dependencies**: `@supabase/supabase-js` (service client), `fetch` nativo. Sin SDK de Gupshup (HTTP directo).

**Storage**: Supabase Postgres. Tablas: `whatsapp_credentials` (service-role-only, ya existe, se le agrega `app_name`), `whatsapp_template_map` (nueva), `whatsapp_outbox` (existe).

**Testing**: Vitest (unidad para los builders puros del adapter + dispatch por provider; sin red).

**Target Platform**: Vercel serverless (envío inline best-effort desde server actions/rutas).

**Project Type**: Web app (Next.js monolito, módulos de dominio en `src/lib/<dominio>/`).

**Performance/Constraints**: envío inline best-effort; nunca bloquea la operación de negocio. Secretos server-only.

**Scale/Scope**: piloto golf-house (2 negocios, ~7 templates). Volumen bajo; sin cron (inline + reproceso manual existente).

## Constitution Check

*GATE: pasa antes de implementar. Re-chequear tras el diseño.*

- **I. Multi-tenancy estricto** ✅ — credenciales y templates scopeados por `business_id`; el adapter siempre resuelve por negocio; nunca key global.
- **II. Test-First** ✅ — los builders del adapter Gupshup (request/response) y el dispatch por provider son lógica pura → TDD (rojo→verde). Es lógica de integración con dinero indirecto (avisos), se testea.
- **III. Server Actions + Zod** ✅ — la carga de credenciales es una server action con Zod; el envío corre server-side con service client.
- **IV. Centavos + timezone AR** ✅/N-A — esta feature no toca importes; `sent_at` en ISO/UTC como hoy.
- **V. Secretos server-only** ✅ — `api_key`/`app_name` en tabla service-role-only; nunca en logs/errores/UI; masking obligatorio.
- **VI. Spec-Driven + approval gate** ✅ — spec + plan antes de código.
- **VII. Migraciones versionadas** ✅ — migración `0005` + `pnpm db:types`.
- **Gate de design (integración externa + secreto + multi-tenant)** ✅ — aplica; este plan documenta las decisiones abajo.

**Resultado**: PASS. Sin violaciones que justificar.

## Project Structure

### Documentation (this feature)

```text
specs/037-proveedor-whatsapp-swappable-gupshup/
├── spec.md      # requisitos + user stories
├── plan.md      # este archivo
└── tasks.md     # checklist TDD (/speckit-tasks)
```

### Source Code (repository root)

```text
src/lib/notifications/
├── whatsapp-sender.ts        # MOD: dispatch por provider; loadCreds amplía select (provider, app_name)
├── whatsapp-provider.ts      # NUEVO: port WhatsappOutboundAdapter + getOutboundAdapter(provider)
├── whatsapp-gupshup.ts       # NUEVO: builders puros (session/template) + parse de respuesta
├── whatsapp-gupshup.test.ts  # NUEVO: TDD de los builders + parse
├── whatsapp-360dialog.ts     # MOD: re-encuadrado como impl del port (sin cambio funcional)
├── template-map.ts           # NUEVO: resolveProviderTemplateId(businessId, provider, name, lang)
├── template-map.test.ts      # NUEVO
├── whatsapp-outbox.ts        # sin cambios de contrato (ya pasa businessId + text|template)
└── delivery-notify.ts / campaigns/channels.ts / create.ts  # SIN CAMBIOS (consumidores)

src/components/admin/settings/  # MOD: campo app_name + selector de proveedor + test de conexión
supabase/migrations/0005_whatsapp_gupshup.sql   # NUEVO
```

**Structure Decision**: patrón de módulo de dominio existente (`src/lib/notifications/`). El acoplamiento a cada proveedor queda **aislado** en su archivo adapter; `whatsapp-sender.ts` solo hace dispatch. El gateway propio, a futuro, es `whatsapp-gateway.ts` implementando el mismo port.

## Design / Decisiones técnicas

### D1 — Port de proveedor
`WhatsappOutboundAdapter { sendText(creds,to,text), sendTemplate(creds,to,{id,params}) }`. `getOutboundAdapter(provider)` = switch puro. `sendWhatsapp` resuelve credenciales del negocio, elige adapter y delega. La firma pública y `WhatsappSendResult` (`{ ok, sent_at, messageId } | { ok:false, error }`) **no cambian**.

### D2 — Wire-format Gupshup (verificado contra doc)
- **Sesión**: `POST https://api.gupshup.io/wa/api/v1/msg`, headers `{ "Content-Type": "application/x-www-form-urlencoded", apikey: <key> }`, form: `channel=whatsapp`, `source=<from E.164 sin +>`, `destination=<to>`, `src.name=<app_name>`, `message=JSON.stringify({type:"text",text})`.
- **Template**: `POST .../wa/api/v1/template/msg`, mismo header/encoding, form: `...`, `template=JSON.stringify({ id:<uuid>, params:[...] })`.
- **Respuesta OK**: `200 { status:"submitted", messageId:<uuid> }` → `ok:true, messageId`. Otro → `ok:false, error` saneado (sin key). `GUPSHUP_API_URL` (env) permite apuntar al sandbox.

### D3 — Mapeo name→id
Meta/360dialog usa `name`+`lang`+components; Gupshup exige `id` (uuid) + params posicional. `template_map.ts` resuelve por (business, provider, name, lang)→id. Los `params` ya vienen posicionales (`template.params: string[]`), sin transformación. Sin id → `ok:false` "falta template".

### D4 — `ok:true` ≠ entregado
Gupshup ackea con `submitted`; las fallas reales llegan async por `message-event` (fuera de scope → 039). Se documenta la semántica; `whatsapp_outbox.sent` significa "aceptado por el proveedor".

## Data model (migración `0005`)

- `whatsapp_credentials`: `add column app_name text` (server-only; comentario "src.name de Gupshup"). Opcional `CHECK provider in ('360dialog','gupshup','gateway')`.
- `whatsapp_template_map`: `(business_id, provider, template_name, lang default 'es_AR', provider_template_id, created_at, pk(business_id, provider, template_name, lang))`, RLS **service-role-only** + policies platform-admin (patrón `whatsapp_credentials`).
- `pnpm db:types` tras aplicar al cloud vía MCP.

## Complexity Tracking

Sin violaciones a la constitución que justificar. La tabla de mapeo aparte (en vez de columna en `delivery_message_templates`) se justifica porque los templates provienen de múltiples orígenes (delivery, reserva, campañas, verificación) y deben ser provider-agnósticos.
