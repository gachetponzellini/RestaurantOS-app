-- ============================================================
-- 0047: seat_number en order_items + payment_method_configs
-- Dos quick-wins derivados del análisis de Maxirest:
--   1. seat_number: saber qué pidió cada comensal, dividir cuenta automáticamente.
--   2. payment_method_configs: recargo/descuento por forma de cobro.
-- ============================================================

-- === FEATURE 1: seat_number ===

alter table public.order_items
  add column seat_number int check (seat_number is null or seat_number >= 1);

-- Extender split_mode para incluir 'por_comensal'.
alter table public.order_splits
  drop constraint order_splits_split_mode_check;
alter table public.order_splits
  add constraint order_splits_split_mode_check
  check (split_mode in ('por_personas', 'por_items', 'por_comensal'));


-- === FEATURE 2: payment_method_configs ===

create table public.payment_method_configs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  method text not null,
  adjustment_percent numeric(5,2) not null default 0,
  label text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, method)
);

alter table public.payment_method_configs enable row level security;

create policy "members_select_pmc" on public.payment_method_configs
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "admin_manage_pmc" on public.payment_method_configs
  for all to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

-- Persistir el ajuste aplicado en cada payment para auditoría.
alter table public.payments
  add column adjustment_percent numeric(5,2) not null default 0,
  add column adjustment_cents bigint not null default 0;
