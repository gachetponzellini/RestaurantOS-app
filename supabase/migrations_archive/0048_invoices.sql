-- =============================================================
-- 0048 — Facturación AFIP: tabla invoices + config en businesses
--
-- Agrega tabla `invoices` para comprobantes electrónicos (AFIP /
-- ARCA) y columnas de configuración fiscal en `businesses`.
-- El provider recomendado para MVP es Tusfacturas (SaaS); la
-- interfaz soporta migrar a AfipSDK o conexión directa después.
--
-- Ver: wiki/planes/plan-afip.md
-- =============================================================

-- ── 1. invoices ─────────────────────────────────────────────────

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,

  -- AFIP / comprobante
  tipo_comprobante text not null check (tipo_comprobante in (
    'factura_a', 'factura_b', 'nota_credito_a', 'nota_credito_b'
  )),
  punto_venta int not null,
  numero int not null,
  cae text,
  cae_vencimiento date,
  cuit_receptor text,
  razon_social_receptor text,

  -- Montos (centavos)
  total_cents bigint not null check (total_cents >= 0),
  neto_cents bigint not null check (neto_cents >= 0),
  iva_cents bigint not null check (iva_cents >= 0),
  iva_rate numeric(5,2) not null default 21.00,

  -- Estado
  status text not null default 'pending' check (status in (
    'pending', 'authorized', 'failed', 'cancelled'
  )),
  error_message text,
  pdf_url text,

  -- Meta
  provider text not null default 'tusfacturas',
  provider_response jsonb,
  created_at timestamptz not null default now(),

  -- Un comprobante es único por negocio + tipo + PV + número
  unique (business_id, tipo_comprobante, punto_venta, numero)
);

-- ── Indexes ──────────────────────────────────────────────────────

create index if not exists invoices_business_created_idx
  on public.invoices (business_id, created_at desc);

create index if not exists invoices_order_idx
  on public.invoices (order_id)
  where order_id is not null;

create index if not exists invoices_payment_idx
  on public.invoices (payment_id)
  where payment_id is not null;

create index if not exists invoices_business_status_idx
  on public.invoices (business_id, status)
  where status in ('pending', 'failed');

-- ── RLS ──────────────────────────────────────────────────────────

alter table public.invoices enable row level security;

-- Members: select
create policy "members_select_invoices" on public.invoices
  for select to authenticated
  using (public.is_business_member(business_id));

-- Members: insert (mozo/encargado/admin pueden emitir)
create policy "members_insert_invoices" on public.invoices
  for insert to authenticated
  with check (public.is_business_member(business_id));

-- Members: update (retry de failed, cancelación)
create policy "members_update_invoices" on public.invoices
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

-- Platform admin
create policy "platform_select_invoices" on public.invoices
  for select to authenticated
  using (public.is_platform_admin());

create policy "platform_insert_invoices" on public.invoices
  for insert to authenticated
  with check (public.is_platform_admin());

create policy "platform_update_invoices" on public.invoices
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ── 2. Configuración AFIP en businesses ─────────────────────────

alter table public.businesses
  add column if not exists afip_cuit text,
  add column if not exists afip_punto_venta int,
  add column if not exists afip_provider text default 'tusfacturas',
  add column if not exists afip_default_tipo text default 'factura_b';

comment on column public.businesses.afip_cuit is 'CUIT del negocio para facturación AFIP/ARCA';
comment on column public.businesses.afip_punto_venta is 'Punto de venta AFIP asignado a este sistema';
comment on column public.businesses.afip_provider is 'Provider de facturación: tusfacturas, afipsdk, direct';
comment on column public.businesses.afip_default_tipo is 'Tipo de comprobante por defecto (factura_b para consumidor final)';
