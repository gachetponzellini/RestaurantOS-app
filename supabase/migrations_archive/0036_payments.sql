-- ============================================
-- Bloque 5 · CU-04 · Pagos contra splits + caja_turno
-- ============================================
-- Crea la tabla `payments` que registra cada cobro físico (cash / card_manual
-- / mp_link / mp_qr / other). Un cobro mixto en mesa = N rows en payments,
-- todos contra el mismo `order_id`.
--
-- Diseño:
--   - `split_id` nullable: si la order no se dividió, los payments apuntan
--     directo al order sin split.
--   - `caja_turno_id` apunta al turno físico open al momento del cobro
--     (regla R1 de CU-04). La FK se agrega en 0037 después de crear la
--     tabla `caja_turnos` para evitar dependencia circular entre migraciones
--     (orden de aplicación: 0036 crea payments sin FK a caja, 0037 crea
--     caja_turnos y luego ata la FK).
--   - `attributed_mozo_id` es la atribución de propina al mozo que atendió
--     (last_mozo_id derivado server-side, R10 de CU-03 / R3 de CU-04). NO
--     se confía en input del cliente.
--   - `payment_status` independiente del lifecycle de la order: arranca
--     'paid' para cash/card_manual/other (cobro inmediato) y 'pending' para
--     mp_link/mp_qr (espera webhook).
--
-- También extiende `orders` con `closed_at` y `total_paid_cents` para el
-- snapshot post-cobro (cierre de la order — R8 de CU-04).
--
-- Ver: wiki/casos-de-uso/CU-04-cobro.md.
-- ============================================

-- ── 1. payments ─────────────────────────────────────────────
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete cascade,
  split_id uuid references public.order_splits(id) on delete set null,
  -- FK a caja_turnos(id) se ata en 0037 (la tabla todavía no existe aquí).
  caja_turno_id uuid not null,
  operated_by uuid references public.users(id) on delete set null,
  attributed_mozo_id uuid references public.users(id) on delete set null,
  method text not null check (method in (
    'cash', 'card_manual', 'mp_link', 'mp_qr', 'other'
  )),
  amount_cents bigint not null check (amount_cents >= 0),
  tip_cents bigint not null default 0 check (tip_cents >= 0),
  last_four text check (last_four is null or length(last_four) = 4),
  card_brand text check (card_brand is null or card_brand in (
    'visa', 'mastercard', 'amex', 'otro'
  )),
  mp_payment_id text,
  mp_preference_id text,
  payment_status text not null default 'paid'
    check (payment_status in ('pending', 'paid', 'failed', 'refunded')),
  notes text,
  refunded_at timestamptz,
  refunded_reason text,
  created_at timestamptz not null default now()
);

create index if not exists payments_order_idx
  on public.payments (order_id);

create index if not exists payments_caja_turno_idx
  on public.payments (caja_turno_id);

create index if not exists payments_business_method_idx
  on public.payments (business_id, method, created_at desc);

create index if not exists payments_attributed_mozo_idx
  on public.payments (attributed_mozo_id, created_at desc)
  where attributed_mozo_id is not null;

create index if not exists payments_mp_idx
  on public.payments (mp_payment_id)
  where mp_payment_id is not null;

create index if not exists payments_split_idx
  on public.payments (split_id)
  where split_id is not null;

alter table public.payments enable row level security;

create policy "members_select_payments" on public.payments
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "members_insert_payments" on public.payments
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "members_update_payments" on public.payments
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

-- ── 2. orders: closed_at + total_paid_cents ─────────────────
alter table public.orders
  add column if not exists closed_at timestamptz;

alter table public.orders
  add column if not exists total_paid_cents bigint not null default 0
    check (total_paid_cents >= 0);

create index if not exists orders_closed_at_idx
  on public.orders (business_id, closed_at desc)
  where closed_at is not null;
