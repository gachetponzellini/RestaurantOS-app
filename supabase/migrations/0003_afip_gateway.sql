-- 0003_afip_gateway.sql
-- Swap del provider de facturación: TusFacturas → ARCA GPSF Gateway.
--
-- El gateway (gachetponzellini/arca-gpsf-gateway) es ASÍNCRONO: se encola una
-- emisión (POST → 202 job_id) y se consulta el resultado por polling
-- (GET /v1/invoices/{job_id}). Autentica con UNA API key por tenant (sk_live_...)
-- + el slug del cliente en el gateway. El CUIT emisor lo determina la API key.
--
-- El secreto NO va en `businesses`: su RLS (admin_select_own_business) expone la
-- fila entera a cualquier member. Va en tabla aparte service-role-only, igual que
-- `whatsapp_credentials` (patrón spec 18).

-- ── 1. Credenciales del gateway por negocio (SERVER-ONLY) ──────────────────
create table if not exists public.afip_gateway_credentials (
    business_id uuid primary key references public.businesses(id) on delete cascade,
    api_key text not null,          -- sk_live_... (Bearer del gateway)
    tenant_slug text not null,      -- slug del cliente en el gateway (/api/t/<slug>/v1)
    base_url text not null default 'https://arca-gpsf-gateway.vercel.app',
    webhook_secret text,            -- Fase 2: verificación de X-Arca-Signature
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.afip_gateway_credentials is
    'Credenciales del ARCA GPSF Gateway por negocio — SERVER-ONLY. Nunca exponer al cliente.';

alter table public.afip_gateway_credentials enable row level security;

-- Sólo platform admin puede ver/tocar el secreto vía cliente autenticado. Los
-- server actions leen/escriben con service role (que bypassa RLS).
create policy "afip_gateway_credentials_select" on public.afip_gateway_credentials
    for select to authenticated using (public.is_platform_admin());
create policy "afip_gateway_credentials_insert" on public.afip_gateway_credentials
    for insert to authenticated with check (public.is_platform_admin());
create policy "afip_gateway_credentials_update" on public.afip_gateway_credentials
    for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "afip_gateway_credentials_delete" on public.afip_gateway_credentials
    for delete to authenticated using (public.is_platform_admin());

grant all on table public.afip_gateway_credentials to anon, authenticated, service_role;

create trigger afip_gateway_credentials_set_updated_at
    before update on public.afip_gateway_credentials
    for each row execute function public.set_updated_at();

-- ── 2. businesses: flag no-sensible + default provider = gateway ───────────
alter table public.businesses
    add column if not exists afip_gateway_connected boolean not null default false;

alter table public.businesses
    alter column afip_provider set default 'gateway';

-- Migrar negocios existentes al nuevo provider (pre-piloto: sandbox, sin emisión real).
update public.businesses
    set afip_provider = 'gateway'
    where afip_provider is null or afip_provider = 'tusfacturas';

-- Reemplazo total de TusFacturas: los tres tokens ya no se usan (el secreto vive
-- ahora en afip_gateway_credentials). Verificado: 0 negocios con tokens cargados.
alter table public.businesses
    drop column if exists afip_provider_api_token,
    drop column if exists afip_provider_api_key,
    drop column if exists afip_provider_user_token;

comment on column public.businesses.afip_provider is
    'Provider de facturación: gateway (ARCA GPSF Gateway) | sandbox (pruebas)';
comment on column public.businesses.afip_gateway_connected is
    'Flag no-sensible: hay credenciales del gateway cargadas (el secreto vive en afip_gateway_credentials).';

-- ── 3. invoices: job del gateway para polling + QR de ARCA ─────────────────
alter table public.invoices
    add column if not exists provider_job_id text,
    add column if not exists qr_url text;

comment on column public.invoices.provider_job_id is
    'job_id del ARCA GPSF Gateway — se pollea GET /v1/invoices/{job_id} hasta estado terminal.';
comment on column public.invoices.qr_url is
    'URL del QR de ARCA (RG 4892) devuelta por el gateway al autorizar.';

create index if not exists invoices_provider_job_id_idx
    on public.invoices(provider_job_id) where provider_job_id is not null;
