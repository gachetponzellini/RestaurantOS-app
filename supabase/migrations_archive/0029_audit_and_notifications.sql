-- ============================================
-- Bloque 3 · Salón vivo · Auditoría + notificaciones in-app
-- ============================================
-- Tres cambios:
--
-- 1. tables.mozo_id (FK opcional a users) — el mozo "dueño" actual de la mesa.
--    El histórico real de quién atendió está en order_items.loaded_by;
--    `tables.mozo_id` es solo el actual para asignación + transferencia (CU-09).
--    Se setea: pre-servicio (encargado), auto al sentar walk-in (CU-08/a R4),
--    o por transferencia. Se limpia con asignación a null o al pasar a `libre`.
--
-- 2. tables_audit_log — historial unificado de cambios sobre mesas.
--    `kind` distingue tipo de evento: assignment | status | transfer.
--    business_id se denormaliza porque tables no tiene business_id directo
--    (viaja via floor_plans), y RLS por is_business_member es más simple así.
--
-- 3. notifications — feed in-app multi-rol.
--    user_id seteado = notif dirigida a un usuario puntual.
--    target_role seteado (con user_id null) = broadcast por rol al business.
--    Se usa primero para T5 de CU-09 (transferencia → notif al encargado),
--    y queda lista para futuros CUs.
--
-- Ver: wiki/casos-de-uso/CU-07-estados-mesa.md, CU-08a-walk-in.md,
--      CU-09-asignacion-mozo.md.
-- ============================================

-- ── 1. tables.mozo_id ─────────────────────────────────────
alter table public.tables
  add column if not exists mozo_id uuid references public.users(id) on delete set null;

create index if not exists tables_mozo_idx
  on public.tables (mozo_id)
  where mozo_id is not null;

-- ── 2. tables_audit_log ───────────────────────────────────
create table if not exists public.tables_audit_log (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null check (kind in ('assignment', 'status', 'transfer')),
  from_value text,
  to_value text,
  by_user_id uuid references public.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists tables_audit_table_idx
  on public.tables_audit_log (table_id, created_at desc);

create index if not exists tables_audit_business_idx
  on public.tables_audit_log (business_id, created_at desc);

alter table public.tables_audit_log enable row level security;

create policy "members_select_tables_audit_log" on public.tables_audit_log
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "members_insert_tables_audit_log" on public.tables_audit_log
  for insert to authenticated
  with check (public.is_business_member(business_id));

-- ── 3. notifications ──────────────────────────────────────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  target_role text check (target_role in ('admin', 'encargado', 'mozo')),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_target_check
    check ((user_id is not null) or (target_role is not null))
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, read_at, created_at desc)
  where user_id is not null;

create index if not exists notifications_role_idx
  on public.notifications (business_id, target_role, read_at)
  where target_role is not null;

alter table public.notifications enable row level security;

-- Members del business pueden leer notifs dirigidas a ellos (user_id) o a su rol.
-- El filtrado fino (is mine? is for my role?) lo hace la app — RLS solo asegura
-- que no se lean notifs de otro business.
create policy "members_select_notifications" on public.notifications
  for select to authenticated
  using (public.is_business_member(business_id));

-- Update solo para marcar como leídas (read_at). Member del business → puede.
create policy "members_update_notifications" on public.notifications
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

-- Insert: solo via service-role desde server actions (no policy aquí).
