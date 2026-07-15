-- 0010_customer_channel_email.sql
-- Spec 45 (notificaciones al cliente por email — puente pre-WhatsApp).
--
-- Introduce el CANAL de aviso al cliente configurable POR NEGOCIO. Hoy el único
-- canal es WhatsApp (bloqueado por verificación de Meta / templates HSM); este
-- puente permite despachar los mensajes transaccionales por EMAIL (Resend, ya
-- integrado en spec 34) sin quitar código: se vuelve a WhatsApp cambiando el
-- flag `customer_channel`. El email queda como canal alternativo/fallback.
--
-- Aditiva y de bajo riesgo:
--   • businesses.customer_channel  → default 'whatsapp' = CERO regresión.
--   • orders/reservations.customer_email → snapshot del email del cliente al
--     crear (denormalizado, igual que customer_name/customer_phone). Nullable:
--     pedidos/reservas sin cliente logueado (carga manual del staff) quedan NULL.
--   • reservations.confirm_token → token opaco para el link de confirmación de
--     asistencia sin login (double opt-in, US "confirmación de asistencia").
--   • customer_message_log → idempotencia + auditoría de despachos al cliente
--     (espejo conceptual de whatsapp_outbox), service-role para escritura.

-- ── canal por negocio ────────────────────────────────────────────────────────
alter table "public"."businesses"
  add column if not exists "customer_channel" text not null default 'whatsapp';

alter table "public"."businesses"
  drop constraint if exists "businesses_customer_channel_check";
alter table "public"."businesses"
  add constraint "businesses_customer_channel_check"
  check ("customer_channel" in ('whatsapp', 'email', 'both'));

comment on column "public"."businesses"."customer_channel" is
  'Spec 45: canal de aviso transaccional al cliente (whatsapp|email|both). Default whatsapp (sin regresión). golf-house opera en email mientras WhatsApp está trabado en Meta.';

-- ── email denormalizado del cliente (snapshot al crear) ──────────────────────
alter table "public"."orders"
  add column if not exists "customer_email" text;
comment on column "public"."orders"."customer_email" is
  'Spec 45: email del cliente al momento de crear el pedido (snapshot, denormalizado desde el cliente logueado). NULL si el pedido no tiene cliente identificado.';

alter table "public"."reservations"
  add column if not exists "customer_email" text;
comment on column "public"."reservations"."customer_email" is
  'Spec 45: email del cliente al momento de crear la reserva (snapshot, denormalizado desde auth.users). NULL si la reserva la cargó el staff a mano.';

-- ── double opt-in: token para confirmar asistencia sin login ─────────────────
-- El recordatorio incluye un link /reservar/confirmar/<confirm_token> que setea
-- client_confirmed_at. Token opaco por reserva (default puebla filas existentes).
alter table "public"."reservations"
  add column if not exists "confirm_token" uuid not null default gen_random_uuid();
comment on column "public"."reservations"."confirm_token" is
  'Spec 45 (double opt-in): token opaco para el link de confirmación de asistencia sin login. Setea client_confirmed_at. La consecuencia dura (liberar mesa si no confirma) es un flag aparte, apagado por default.';
create unique index if not exists "reservations_confirm_token_uidx"
  on "public"."reservations" ("confirm_token");

-- ── registro de despachos al cliente (idempotencia + auditoría) ──────────────
create table if not exists "public"."customer_message_log" (
  "id" uuid default gen_random_uuid() not null,
  "business_id" uuid not null,
  "event" text not null,
  "ref_id" uuid,
  "channel" text not null,
  "status" text not null,
  "reason" text,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  constraint "customer_message_log_pkey" primary key ("id"),
  constraint "customer_message_log_business_id_fkey"
    foreign key ("business_id") references "public"."businesses"("id") on delete cascade,
  constraint "customer_message_log_channel_check"
    check ("channel" in ('whatsapp', 'email')),
  constraint "customer_message_log_status_check"
    check ("status" in ('sent', 'failed', 'skipped'))
);

comment on table "public"."customer_message_log" is
  'Spec 45: despachos transaccionales al cliente por canal. El UNIQUE (business_id,event,ref_id,channel) da idempotencia (reintentos de webhook no duplican). Best-effort: `status` registra sent/failed/skipped + motivo.';

-- Idempotencia: un evento por (negocio, evento, ref, canal). ref_id nullable
-- (eventos sin entidad); el índice UNIQUE trata NULLs como distintos, aceptable
-- porque los eventos idempotentes siempre traen ref_id.
create unique index if not exists "customer_message_log_dedup_uidx"
  on "public"."customer_message_log" ("business_id", "event", "ref_id", "channel");

alter table "public"."customer_message_log" enable row level security;

-- Escritura: solo platform_admin desde `authenticated`; el service client (que
-- bypassa RLS) es quien registra en runtime. El dueño puede LEER lo suyo.
create policy "customer_message_log_select" on "public"."customer_message_log"
  for select to "authenticated"
  using ("public"."is_platform_admin"() or "public"."is_business_member"("business_id"));
create policy "customer_message_log_insert" on "public"."customer_message_log"
  for insert to "authenticated"
  with check ("public"."is_platform_admin"());
create policy "customer_message_log_update" on "public"."customer_message_log"
  for update to "authenticated"
  using ("public"."is_platform_admin"()) with check ("public"."is_platform_admin"());
create policy "customer_message_log_delete" on "public"."customer_message_log"
  for delete to "authenticated"
  using ("public"."is_platform_admin"());
