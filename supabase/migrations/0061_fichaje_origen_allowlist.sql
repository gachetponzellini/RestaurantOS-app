-- ═══════════════════════════════════════════════════════════════════════
-- 0061 — Fichaje sólo desde las PCs del local (spec 11)
--
-- Hoy `clockPunch` registra una fichada con sólo PIN + URL, sin importar el
-- origen: cualquiera puede fichar desde el celular. Esta migración agrega la
-- infra para restringir el fichaje a orígenes autorizados de la LAN del local
-- (deploy on-site): una allowlist de IP/CIDR por negocio + un log de intentos
-- bloqueados para diagnóstico.
--
-- Semántica de enforcement (decidida en implementación, ver feature wiki):
--   • allowlist VACÍA  → enforcement APAGADO (comportamiento actual: se ficha
--     desde cualquier origen). Evita "brickear" un negocio recién migrado.
--   • allowlist CON ≥1 entrada → enforcement PRENDIDO: sólo IPs dentro de
--     algún CIDR pueden fichar; el resto se rechaza por origen.
--
-- Ver: wiki/specs/11-fichaje-asistencia-onsite/
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. clock_allowed_origins — allowlist de IP/CIDR por negocio
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.clock_allowed_origins (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  cidr text not null,
  label text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, cidr)
);

create index if not exists clock_allowed_origins_business_idx
  on public.clock_allowed_origins (business_id);

comment on table public.clock_allowed_origins is 'Orígenes (IP/CIDR de la LAN del local) habilitados para fichar, por negocio. Vacío = sin enforcement.';
comment on column public.clock_allowed_origins.cidr is 'IPv4 en notación CIDR (ej: 192.168.10.0/24) o IP suelta (ej: 192.168.10.42 = /32).';

-- ─────────────────────────────────────────────────────────────────────
-- 2. clock_blocked_attempts — auditoría mínima de fichadas rechazadas
--    por origen no autorizado (para diagnóstico on-site).
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.clock_blocked_attempts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  ip text,
  pin_masked text,
  attempted_at timestamptz not null default now()
);

create index if not exists clock_blocked_attempts_business_date_idx
  on public.clock_blocked_attempts (business_id, attempted_at desc);

comment on table public.clock_blocked_attempts is 'Intentos de fichada rechazados por origen no autorizado (spec 11). PIN siempre enmascarado.';
comment on column public.clock_blocked_attempts.pin_masked is 'PIN enmascarado (ej: 1**4); nunca el PIN en claro.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. RLS — members select + admin manage + platform
--    Las escrituras desde el servidor (clockPunch / actions) usan el
--    service role (bypassa RLS); estas policies cubren el acceso desde
--    el cliente autenticado (lectura del admin en el panel).
-- ─────────────────────────────────────────────────────────────────────

alter table public.clock_allowed_origins enable row level security;
alter table public.clock_blocked_attempts enable row level security;

-- clock_allowed_origins
create policy "members_select_clock_origins" on public.clock_allowed_origins
  for select to authenticated using (public.is_business_member(business_id));
create policy "members_insert_clock_origins" on public.clock_allowed_origins
  for insert to authenticated with check (public.is_business_member(business_id));
create policy "members_update_clock_origins" on public.clock_allowed_origins
  for update to authenticated using (public.is_business_member(business_id));
create policy "members_delete_clock_origins" on public.clock_allowed_origins
  for delete to authenticated using (public.is_business_member(business_id));

create policy "platform_all_clock_origins" on public.clock_allowed_origins
  for all to authenticated using (public.is_platform_admin());

-- clock_blocked_attempts (sólo lectura para members; inserta el server)
create policy "members_select_clock_blocked" on public.clock_blocked_attempts
  for select to authenticated using (public.is_business_member(business_id));

create policy "platform_all_clock_blocked" on public.clock_blocked_attempts
  for all to authenticated using (public.is_platform_admin());
