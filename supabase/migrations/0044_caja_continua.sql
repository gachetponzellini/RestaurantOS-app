-- 0044_caja_continua.sql
-- Refactor: elimina caja_turnos, introduce caja_cortes (modelo de caja continua).
-- Contexto: wiki/planes/plan-refactor-caja-continua.md

-- ═══════════════════════════════════════════════════════════════
-- 1. Crear tabla caja_cortes
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.caja_cortes (
  id uuid primary key default gen_random_uuid(),
  caja_id uuid not null references public.cajas(id) on delete restrict,
  business_id uuid not null references public.businesses(id) on delete cascade,
  encargado_id uuid not null references public.users(id) on delete restrict,

  expected_cash_cents bigint not null,
  closing_cash_cents bigint not null check (closing_cash_cents >= 0),
  difference_cents bigint not null,
  closing_notes text,

  denomination_count jsonb,

  created_at timestamptz not null default now()
);

create index if not exists caja_cortes_caja_idx
  on public.caja_cortes (caja_id, created_at desc);

create index if not exists caja_cortes_business_idx
  on public.caja_cortes (business_id, created_at desc);

alter table public.caja_cortes enable row level security;

create policy "members_select_caja_cortes" on public.caja_cortes
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "members_insert_caja_cortes" on public.caja_cortes
  for insert to authenticated
  with check (public.is_business_member(business_id));

-- ═══════════════════════════════════════════════════════════════
-- 2. payments: agregar caja_id, backfill, hacer NOT NULL
-- ═══════════════════════════════════════════════════════════════

alter table public.payments
  add column caja_id uuid references public.cajas(id) on delete restrict;

update public.payments p
  set caja_id = ct.caja_id
  from public.caja_turnos ct
  where p.caja_turno_id = ct.id;

alter table public.payments
  alter column caja_id set not null;

create index if not exists payments_caja_idx
  on public.payments (caja_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════
-- 3. caja_movimientos: agregar caja_id, backfill, hacer NOT NULL
-- ═══════════════════════════════════════════════════════════════

alter table public.caja_movimientos
  add column caja_id uuid references public.cajas(id) on delete restrict;

update public.caja_movimientos cm
  set caja_id = ct.caja_id
  from public.caja_turnos ct
  where cm.caja_turno_id = ct.id;

alter table public.caja_movimientos
  alter column caja_id set not null;

-- Borrar movimientos de tipo apertura/cierre (ya no existen como movimientos).
-- Se mueve acá (antes del constraint) para no violar la nueva restricción.
delete from public.caja_movimientos
  where kind in ('apertura', 'cierre');

-- Actualizar constraint de kind: solo sangria e ingreso.
alter table public.caja_movimientos
  drop constraint if exists caja_movimientos_kind_check;

alter table public.caja_movimientos
  add constraint caja_movimientos_kind_check
  check (kind in ('sangria', 'ingreso'));

create index if not exists caja_mov_caja_idx
  on public.caja_movimientos (caja_id, created_at desc);

-- ═══════════════════════════════════════════════════════════════
-- 4. Migrar turnos cerrados → caja_cortes
-- ═══════════════════════════════════════════════════════════════

insert into public.caja_cortes (
  caja_id, business_id, encargado_id,
  expected_cash_cents, closing_cash_cents, difference_cents,
  closing_notes, created_at
)
select
  ct.caja_id, ct.business_id, ct.encargado_id,
  coalesce(ct.expected_cash_cents, 0),
  coalesce(ct.closing_cash_cents, 0),
  coalesce(ct.difference_cents, 0),
  ct.closing_notes,
  coalesce(ct.closed_at, ct.opened_at)
from public.caja_turnos ct
where ct.status = 'closed';

-- ═══════════════════════════════════════════════════════════════
-- 5. Limpiar columnas y tablas viejas
-- ═══════════════════════════════════════════════════════════════

-- (apertura/cierre rows already deleted above in section 3)

-- Eliminar FK vieja de payments.
alter table public.payments
  drop column caja_turno_id;

-- Eliminar columna vieja de caja_movimientos.
alter table public.caja_movimientos
  drop column caja_turno_id;

-- Eliminar índices viejos.
drop index if exists payments_caja_turno_idx;
drop index if exists caja_mov_turno_idx;
drop index if exists caja_turnos_one_open_per_caja;

-- Eliminar tabla caja_turnos.
drop table if exists public.caja_turnos;
