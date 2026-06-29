-- ============================================
-- Bloque 5 · CU-06 · Cajas + turnos + movimientos
-- ============================================
-- Tres tablas:
--
-- 1. cajas — cajas físicas del local. El admin las configura (1 caja, 2
--    cajas barra+salón, etc.). Una caja inactiva no aparece para abrir
--    turno pero conserva histórico (R6/A6 de CU-06).
--
-- 2. caja_turnos — un turno por sesión de caja (apertura → cierre). El
--    partial unique index `caja_turnos_one_open_per_caja` hace cumplir R1:
--    una caja física = máx 1 turno con status='open' a la vez. Cualquier
--    intento concurrente de abrir un segundo turno falla con SQLSTATE 23505.
--
-- 3. caja_movimientos — apertura, cierre, sangría, ingreso. Los cobros
--    no entran acá: viven en `payments` y se cruzan al calcular
--    `expected_cash` con un join. `apertura` y `cierre` se loggean acá
--    como audit trail.
--
-- Al final: ata la FK `payments.caja_turno_id → caja_turnos.id` que en
-- 0036 quedó pendiente para evitar la dependencia circular.
--
-- Ver: wiki/casos-de-uso/CU-06-caja.md.
-- ============================================

-- ── 1. cajas ────────────────────────────────────────────────
create table if not exists public.cajas (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create index if not exists cajas_business_active_idx
  on public.cajas (business_id)
  where is_active;

alter table public.cajas enable row level security;

create policy "members_select_cajas" on public.cajas
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "members_insert_cajas" on public.cajas
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "members_update_cajas" on public.cajas
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "members_delete_cajas" on public.cajas
  for delete to authenticated
  using (public.is_business_member(business_id));

-- ── 2. caja_turnos ──────────────────────────────────────────
create table if not exists public.caja_turnos (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references public.cajas(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete cascade,
  encargado_id uuid not null references public.users(id) on delete restrict,
  opening_cash_cents bigint not null check (opening_cash_cents >= 0),
  expected_cash_cents bigint,
  closing_cash_cents bigint,
  difference_cents bigint, -- closing - expected
  closing_notes text,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists caja_turnos_caja_idx
  on public.caja_turnos (caja_id, opened_at desc);

create index if not exists caja_turnos_business_idx
  on public.caja_turnos (business_id, opened_at desc);

create index if not exists caja_turnos_encargado_idx
  on public.caja_turnos (encargado_id, opened_at desc);

-- Una caja, máximo 1 turno open a la vez.
create unique index if not exists caja_turnos_one_open_per_caja
  on public.caja_turnos (caja_id)
  where status = 'open';

alter table public.caja_turnos enable row level security;

create policy "members_select_caja_turnos" on public.caja_turnos
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "members_insert_caja_turnos" on public.caja_turnos
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "members_update_caja_turnos" on public.caja_turnos
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

-- ── 3. caja_movimientos ─────────────────────────────────────
create table if not exists public.caja_movimientos (
  id uuid primary key default gen_random_uuid(),
  caja_turno_id uuid not null references public.caja_turnos(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in (
    'apertura', 'cierre', 'sangria', 'ingreso'
  )),
  amount_cents bigint not null check (amount_cents >= 0),
  reason text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists caja_mov_turno_idx
  on public.caja_movimientos (caja_turno_id, created_at desc);

create index if not exists caja_mov_business_idx
  on public.caja_movimientos (business_id, created_at desc);

alter table public.caja_movimientos enable row level security;

create policy "members_select_caja_mov" on public.caja_movimientos
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "members_insert_caja_mov" on public.caja_movimientos
  for insert to authenticated
  with check (public.is_business_member(business_id));

-- ── 4. atar FK pendiente de 0036 ────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'payments_caja_turno_fk'
  ) then
    alter table public.payments
      add constraint payments_caja_turno_fk
      foreign key (caja_turno_id)
      references public.caja_turnos(id)
      on delete restrict;
  end if;
end$$;
