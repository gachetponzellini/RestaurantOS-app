-- 0014_print_agent_credentials.sql
-- Print agent key POR NEGOCIO (spec 046 — autoinstalador del print-agent).
--
-- Hasta ahora el endpoint del agente (spec 28/33/35) valida contra UNA
-- `PRINT_AGENT_KEY` global de env: la misma key sirve para cualquier negocio.
-- Esto la hace por-negocio, para que cada local descargue su instalador ya
-- configurado y una key filtrada no comprometa a todos.
--
-- El secreto NO va en `businesses` (su RLS expone la fila entera a cualquier
-- member). Va en tabla aparte service-role-only, igual que `afip_gateway_credentials`
-- (spec 13) y `whatsapp_credentials` (spec 18).

-- ── 1. Key del print-agent por negocio (SERVER-ONLY) ───────────────────────
create table if not exists public.print_agent_credentials (
    business_id uuid primary key references public.businesses(id) on delete cascade,
    api_key text not null,          -- pak_live_... (Bearer del agente)
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

comment on table public.print_agent_credentials is
    'Key del print-agent por negocio — SERVER-ONLY. Nunca exponer al cliente salvo al crear/rotar. Mismo patrón que afip_gateway_credentials / whatsapp_credentials.';

alter table public.print_agent_credentials enable row level security;

-- Sólo platform admin puede ver/tocar el secreto vía cliente autenticado. Los
-- server actions leen/escriben con service role (que bypassa RLS).
create policy "print_agent_credentials_select" on public.print_agent_credentials
    for select to authenticated using (public.is_platform_admin());
create policy "print_agent_credentials_insert" on public.print_agent_credentials
    for insert to authenticated with check (public.is_platform_admin());
create policy "print_agent_credentials_update" on public.print_agent_credentials
    for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "print_agent_credentials_delete" on public.print_agent_credentials
    for delete to authenticated using (public.is_platform_admin());

grant all on table public.print_agent_credentials to anon, authenticated, service_role;

create trigger print_agent_credentials_set_updated_at
    before update on public.print_agent_credentials
    for each row execute function public.set_updated_at();

-- ── 2. businesses: flag no-sensible (¿hay key cargada?) ────────────────────
alter table public.businesses
    add column if not exists print_agent_key_set boolean not null default false;

comment on column public.businesses.print_agent_key_set is
    'Flag no-sensible: hay una key del print-agent cargada (el secreto vive en print_agent_credentials). La UI lo usa sin poder leer la key.';
