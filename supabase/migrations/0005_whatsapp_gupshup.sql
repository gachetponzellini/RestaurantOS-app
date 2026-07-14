-- 0005_whatsapp_gupshup.sql
-- Gupshup como proveedor de WhatsApp (PUENTE TEMPORAL). Spec 037.
--
-- 360dialog fue descartado; el destino final es el gateway propio GPSF (trabado
-- en verificación de Meta). Gupshup entra como UN ADAPTER MÁS detrás de
-- `sendWhatsapp`, seleccionado por `whatsapp_credentials.provider` (columna que
-- ya existe, default '360dialog'). Esta migración agrega lo mínimo para Gupshup:
--   1. `app_name` en las credenciales (el `src.name` que exige Gupshup).
--   2. tabla de mapeo name(+lang) → id de template del proveedor (Gupshup usa un
--      UUID por plantilla, no el name+language de Meta/360dialog).
-- El secreto (api_key) ya vive en whatsapp_credentials (service-role-only).

-- ── 1. whatsapp_credentials: app_name de Gupshup + CHECK de provider ────────
alter table public.whatsapp_credentials
    add column if not exists app_name text;

comment on column public.whatsapp_credentials.app_name is
    'Gupshup: nombre de la App (src.name). Server-only. Solo aplica si provider=gupshup.';

-- provider ya existe con default '360dialog'. Restringimos a los valores conocidos
-- (el gateway propio ya está previsto). Los datos actuales son todos '360dialog'.
alter table public.whatsapp_credentials
    drop constraint if exists whatsapp_credentials_provider_check;
alter table public.whatsapp_credentials
    add constraint whatsapp_credentials_provider_check
    check (provider in ('360dialog', 'gupshup', 'gateway'));

-- ── 2. Mapeo name(+lang) → id de template del proveedor (SERVER-ONLY) ───────
-- Provider-agnóstico y multi-origen (delivery, reserva, campañas, verificación):
-- por eso tabla aparte y no una columna en delivery_message_templates.
create table if not exists public.whatsapp_template_map (
    business_id uuid not null references public.businesses(id) on delete cascade,
    provider text not null,
    template_name text not null,          -- nombre lógico usado por el código (ej. delivery_preparing)
    lang text not null default 'es_AR',
    provider_template_id text not null,   -- Gupshup: UUID de la plantilla aprobada
    created_at timestamptz not null default now(),
    primary key (business_id, provider, template_name, lang)
);

comment on table public.whatsapp_template_map is
    'Mapa (negocio, provider, template_name, lang) → id de template del proveedor. SERVER-ONLY. Gupshup identifica plantillas por UUID, no por name+language.';

alter table public.whatsapp_template_map enable row level security;

-- Sólo platform admin vía cliente autenticado; los server actions leen/escriben
-- con service role (que bypassa RLS). Mismo patrón que afip_gateway_credentials (0003).
create policy "whatsapp_template_map_select" on public.whatsapp_template_map
    for select to authenticated using (public.is_platform_admin());
create policy "whatsapp_template_map_insert" on public.whatsapp_template_map
    for insert to authenticated with check (public.is_platform_admin());
create policy "whatsapp_template_map_update" on public.whatsapp_template_map
    for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "whatsapp_template_map_delete" on public.whatsapp_template_map
    for delete to authenticated using (public.is_platform_admin());

grant all on table public.whatsapp_template_map to anon, authenticated, service_role;
