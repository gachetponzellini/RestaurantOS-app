-- 0006_whatsapp_inbound.sql
-- Webhook entrante de WhatsApp (Gupshup) + el bot contesta en vivo. Spec 038.
--
-- Gupshup NO firma sus webhooks (no hay X-Hub-Signature-256 de Meta): la
-- autenticidad se valida con un token compartido por negocio. Y como Gupshup
-- reintenta si no ackeás 2xx a tiempo, hace falta idempotencia por id de mensaje.

-- 1. Secreto del callback por negocio (SERVER-ONLY)
alter table public.whatsapp_credentials
    add column if not exists webhook_token text;

comment on column public.whatsapp_credentials.webhook_token is
    'Secreto compartido para autenticar el webhook entrante (Gupshup no firma). Server-only.';

-- 2. Idempotencia de eventos entrantes (dedupe de reintentos de Gupshup)
create table if not exists public.whatsapp_inbound_events (
    id uuid primary key default gen_random_uuid(),
    business_id uuid not null references public.businesses(id) on delete cascade,
    provider text not null,
    provider_event_id text not null,   -- id del mensaje entrante (payload.id)
    type text not null,
    received_at timestamptz not null default now(),
    unique (business_id, provider_event_id)
);

comment on table public.whatsapp_inbound_events is
    'Dedupe de eventos entrantes de WhatsApp por (negocio, id de mensaje). SERVER-ONLY. Gupshup reintenta si no ackeamos 2xx a tiempo.';

alter table public.whatsapp_inbound_events enable row level security;

-- Acceso sólo server-side (service role, que bypassa RLS). Policies platform-admin
-- por consistencia con whatsapp_template_map/afip_gateway_credentials y para no
-- dejar la tabla sin policy (evita el lint rls_enabled_no_policy).
create policy "whatsapp_inbound_events_select" on public.whatsapp_inbound_events
    for select to authenticated using (public.is_platform_admin());
create policy "whatsapp_inbound_events_insert" on public.whatsapp_inbound_events
    for insert to authenticated with check (public.is_platform_admin());
create policy "whatsapp_inbound_events_update" on public.whatsapp_inbound_events
    for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "whatsapp_inbound_events_delete" on public.whatsapp_inbound_events
    for delete to authenticated using (public.is_platform_admin());

grant all on table public.whatsapp_inbound_events to anon, authenticated, service_role;

create index if not exists whatsapp_inbound_events_business_idx
    on public.whatsapp_inbound_events(business_id, received_at desc);
