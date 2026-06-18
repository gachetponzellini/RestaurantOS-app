-- ═══════════════════════════════════════════════════════════════════════
-- 0076 — Códigos de verificación de teléfono por WhatsApp (spec 25)
--
-- Tras el alta del cliente (spec 24, teléfono en user_metadata.phone), se le
-- envía un código de 6 dígitos por WhatsApp (360dialog, credenciales por
-- negocio) que tipea para verificar la cuenta. El código se genera y valida en
-- el server; acá sólo persistimos su HASH (nunca el código en claro) con
-- expiración, intentos y consumo.
--
-- Seguridad: tabla service-role-only. RLS habilitada SIN policies para
-- `authenticated`/`anon` → ese rol no lee ni escribe nada. Todo el acceso pasa
-- por server actions con el service client (que bypassa RLS). Mismo criterio
-- que `whatsapp_credentials` (0057) y el hardening del spec 19: datos sensibles
-- y transitorios fuera del alcance del cliente.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.phone_verification_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Busca el código activo de un usuario (no consumido). consumed_at IS NULL ⇒
-- vigente; el server toma el más reciente.
create index if not exists phone_verification_codes_user_active_idx
  on public.phone_verification_codes (user_id, consumed_at);

alter table public.phone_verification_codes enable row level security;

-- Sin policies a propósito: ni `anon` ni `authenticated` acceden. Sólo el
-- service-role (server) genera, lee y consume estos códigos.
