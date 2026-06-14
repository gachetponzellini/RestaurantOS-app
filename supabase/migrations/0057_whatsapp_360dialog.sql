-- ═══════════════════════════════════════════════════════════════════════
-- 0057 — Envío real de WhatsApp vía 360dialog (spec 18)
--
-- Cierra el stub del cambio 15 (whatsapp-sender) y prepara el wabaChannel del 16.
-- Reemplaza la sub-parte "Meta/WhatsApp por negocio" que proponía el cambio 14.
--
-- Cuatro cambios:
--
-- 1. whatsapp_credentials — credenciales de 360dialog POR NEGOCIO, en tabla
--    APARTE (no en `businesses`). Motivo de seguridad: la policy
--    `admin_select_own_business` (0002) deja a cualquier member leer la fila
--    entera de `businesses`, y la RLS de Postgres no filtra por columna — así
--    que un secreto ahí (como `mp_access_token`) es legible por members. Esta
--    tabla tiene RLS service-role-only: members NO la leen.
--
-- 2. businesses.whatsapp_connected — booleano NO secreto para que la UI muestre
--    "conectado: sí/no" sin tocar la key.
--
-- 3. delivery_message_templates — template_name/lang/params: los avisos
--    proactivos (fuera de la ventana de 24h) se mandan como template messages
--    aprobados por Meta, no texto libre.
--
-- 4. whatsapp_outbox.provider_message_id — id que devuelve 360dialog (traza +
--    anti-doble-envío en el reproceso).
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. whatsapp_credentials (service-role-only)
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.whatsapp_credentials (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  provider text not null default '360dialog',
  api_key text,
  from_phone text,
  channel_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger whatsapp_credentials_set_updated_at
  before update on public.whatsapp_credentials
  for each row execute function set_updated_at();

alter table public.whatsapp_credentials enable row level security;

-- Sin policy para `authenticated`: members NO leen ni escriben el secreto.
-- El sender lo lee y la action lo escribe vía service-role (bypassa RLS).
-- Sólo el equipo de plataforma puede inspeccionarla.
create policy "platform_select_whatsapp_credentials" on public.whatsapp_credentials
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_whatsapp_credentials" on public.whatsapp_credentials
  for all to authenticated using (public.is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 2. businesses.whatsapp_connected (no secreto — indicador para la UI)
-- ─────────────────────────────────────────────────────────────────────

alter table public.businesses
  add column if not exists whatsapp_connected boolean not null default false;

-- ─────────────────────────────────────────────────────────────────────
-- 3. delivery_message_templates — soporte de template messages de Meta
-- ─────────────────────────────────────────────────────────────────────

alter table public.delivery_message_templates
  add column if not exists template_name text,
  add column if not exists template_lang text not null default 'es_AR',
  add column if not exists template_params jsonb;

-- ─────────────────────────────────────────────────────────────────────
-- 4. whatsapp_outbox.provider_message_id (traza + anti-doble-envío)
-- ─────────────────────────────────────────────────────────────────────

alter table public.whatsapp_outbox
  add column if not exists provider_message_id text;
