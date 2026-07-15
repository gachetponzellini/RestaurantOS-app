# Implementation Plan: Notificaciones al cliente por email (spec 45)

**Spec**: `spec.md` · **Issue**: #62 · **Branch**: `045-notificaciones-cliente-email`

## Enfoque

El puente NO es un parche que se arranca: es un **canal de aviso al cliente configurable por negocio**, hoy fijado en `email`. Se vuelve a WhatsApp con un flag (`customer_channel`), sin quitar código. El email queda como fallback permanente.

Se reutiliza al máximo lo existente:
- Transporte email: `src/lib/email/send.ts` + `resend-adapter.ts` (spec 34).
- Lógica de supresión agnóstica de canal: `src/lib/notifications/delivery-templates.ts` (`renderDeliveryMessage`, reglas dine_in / on_the_way / plantilla apagada).
- Puntos de disparo ya centralizados: `delivery-notify.ts`, `mp/webhook`. **No cambian sus call sites.**

## Decisiones (resuelven los NEEDS CLARIFICATION del spec)

- **Default de canal (FR-002)**: la columna `businesses.customer_channel` default `'whatsapp'` → cero regresión para negocios existentes. golf-house (House y Golf) se setea a `'email'` con un UPDATE de datos, no en el schema.
- **Degradación sin email (FR-013)**: si el canal es `email` y no hay email resoluble → se registra `skipped` con motivo, **sin** fallback automático a WhatsApp (comportamiento predecible; el negocio eligió email). En `both`, cada canal se intenta de forma independiente (WhatsApp si hay teléfono, email si hay email).
- **Ventana del recordatorio (FR-011)**: cron cada 15 min; envía a reservas `confirmed` que arrancan dentro de una ventana configurable (default **~3 h antes**). Idempotencia por `reservation_reminders` / `customer_message_log`. Informativo, sin confirmación de asistencia.
- **Idempotencia (FR-008)**: dedup en `customer_message_log` por `(business_id, event, ref_id, channel)`. `event` es un enum estable (`order_status:<status>`, `order_scheduled`, `reservation_confirmed`, `reservation_reminder`, `invoice_issued`).

## Arquitectura de código

### Capa nueva (agnóstica de canal)
- `src/lib/notifications/customer-channel.ts` — `resolveCustomerChannel(businessId)` + `dispatchCustomerMessage({ businessId, event, refId, recipient, whatsapp, email })`. Resuelve el canal del negocio y despacha a cada canal activo (best-effort, dedup). **Lógica pura testeable** para la selección de canal.
- `src/lib/notifications/email-outbox.ts` — `enqueueEmail(...)`, espejo de `whatsapp-outbox.ts`: registra en `customer_message_log`, despacha vía `sendEmail`, best-effort, nunca lanza.
- `src/lib/email/customer-templates.ts` — render por evento (`subject` + HTML con branding del negocio), reusando placeholders de delivery. **Lógica pura testeable.**

### Modificaciones
- `delivery-notify.ts` — `notifyDeliveryStatusChange` / `notifyScheduledConfirmed` pasan a construir un **payload agnóstico** (destinatario + body + template WhatsApp + datos email) y delegar en `dispatchCustomerMessage`. La rama WhatsApp conserva exactamente el comportamiento actual.
- `booking-actions.ts` (`createReservationFromCustomer`) — poblar `reservations.customer_email` desde el auth user y disparar `notifyReservationConfirmed` (best-effort, tras crear).
- Server action de creación de order online — poblar `orders.customer_email` desde el cliente logueado.
- `emit-invoice.ts` (AFIP) — hook best-effort post-emisión → `dispatchCustomerMessage(event: invoice_issued)`.
- Cron nuevo de recordatorio de reservas (patrón espejo de `sendDueShiftSummaries`): `src/lib/reservations/reminders.ts` + endpoint/cron.
- UI: selector de canal en settings del negocio (`src/components/admin/settings/…`).

### Migración `0010_customer_channel_email.sql`
- `ALTER TABLE businesses ADD COLUMN customer_channel text NOT NULL DEFAULT 'whatsapp' CHECK (customer_channel IN ('whatsapp','email','both'))`.
- `ALTER TABLE orders ADD COLUMN customer_email text` (nullable).
- `ALTER TABLE reservations ADD COLUMN customer_email text` (nullable).
- `CREATE TABLE customer_message_log (business_id, event text, ref_id uuid, channel text, status text, reason text, sent_at, created_at, UNIQUE(business_id, event, ref_id, channel))` — service-role-only (sin políticas para `authenticated`; se accede con service client como el outbox de WhatsApp).
- `pnpm db:types` tras aplicar al cloud.

## Testing (TDD)

Lógica pura primero (rojo → verde):
- Selección de canal (`whatsapp|email|both`, default, sin email → skipped).
- Render de templates de email por evento (subject/HTML, placeholders, supresión reusada).
- Idempotencia (segundo intento con misma clave → no re-envía).
- Predicado de ventana del recordatorio (espejo TS del cron, testeable sin correr el cron — patrón `isOverdueConfirmed`).

Integración: `enqueueEmail` best-effort (no lanza ante fallo del proveedor), degradación sin email.

## Reversibilidad

`UPDATE businesses SET customer_channel='whatsapp'` restaura el flujo previo. Cero código removido. Verificado por SC-002/SC-003.

## Dependencia operativa (fuera del código)

- Dominio verificado en Resend (SPF/DKIM/DMARC) + `from` con marca del negocio (subdominio dedicado a transaccionales). Bloquea la verificación **en vivo**, no la implementación ni los tests.
