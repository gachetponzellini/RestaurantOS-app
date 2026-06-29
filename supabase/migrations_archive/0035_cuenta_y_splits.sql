-- ============================================
-- Bloque 5 · CU-03 · Cuenta + propina + descuento + splits
-- ============================================
-- Tres cambios:
--
-- 1. orders.tip_cents — propina aplicada al pedir cuenta. Se desagrega de
--    `total_cents` para reportar ventas vs propinas. `discount_cents` ya
--    existía desde 0001; sumamos `discount_reason text` para el motivo
--    obligatorio cuando hay descuento (R4 de CU-03).
--
-- 2. order_splits — divisiones de la cuenta. `expected_amount_cents` es lo
--    que el split debe pagar (calculado server con prorrateo de propina /
--    descuento al subtotal del split). `paid_amount_cents` se actualiza al
--    registrar payments (Bloque 5 §0036). status va pending → paid (cuando
--    paid_amount >= expected) o cancelled (split anulado).
--
-- 3. order_split_items — n:m para modo `por_items`. PK compuesta (split_id,
--    order_item_id). Por R6 de CU-03, cada `order_item` debe estar a lo
--    sumo en un split, pero el constraint duro vive en la action al
--    construir la división, no en el schema (la PK no lo asegura por sí
--    sola, aunque sí impide duplicados dentro del mismo split).
--
-- Ver: wiki/casos-de-uso/CU-03-cuenta.md.
-- ============================================

-- ── 1. orders: tip_cents + discount_reason ──────────────────
alter table public.orders
  add column if not exists tip_cents bigint not null default 0
    check (tip_cents >= 0);

alter table public.orders
  add column if not exists discount_reason text;

-- ── 2. order_splits ─────────────────────────────────────────
create table if not exists public.order_splits (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  split_mode text not null check (split_mode in ('por_personas', 'por_items')),
  split_index int not null,
  expected_amount_cents bigint not null check (expected_amount_cents >= 0),
  paid_amount_cents bigint not null default 0 check (paid_amount_cents >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'cancelled')),
  label text,
  created_at timestamptz not null default now(),
  unique (order_id, split_index)
);

create index if not exists order_splits_order_idx
  on public.order_splits (order_id);

create index if not exists order_splits_business_idx
  on public.order_splits (business_id);

alter table public.order_splits enable row level security;

create policy "members_select_order_splits" on public.order_splits
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "members_insert_order_splits" on public.order_splits
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "members_update_order_splits" on public.order_splits
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "members_delete_order_splits" on public.order_splits
  for delete to authenticated
  using (public.is_business_member(business_id));

-- ── 3. order_split_items ────────────────────────────────────
create table if not exists public.order_split_items (
  split_id uuid not null references public.order_splits(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  primary key (split_id, order_item_id)
);

create index if not exists order_split_items_item_idx
  on public.order_split_items (order_item_id);

alter table public.order_split_items enable row level security;

create policy "members_select_order_split_items" on public.order_split_items
  for select to authenticated
  using (exists (
    select 1 from public.order_splits s
    where s.id = order_split_items.split_id
      and public.is_business_member(s.business_id)
  ));

create policy "members_insert_order_split_items" on public.order_split_items
  for insert to authenticated
  with check (exists (
    select 1 from public.order_splits s
    where s.id = order_split_items.split_id
      and public.is_business_member(s.business_id)
  ));

create policy "members_delete_order_split_items" on public.order_split_items
  for delete to authenticated
  using (exists (
    select 1 from public.order_splits s
    where s.id = order_split_items.split_id
      and public.is_business_member(s.business_id)
  ));
