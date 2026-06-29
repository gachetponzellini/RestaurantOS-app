-- ============================================
-- Sistema de turnos / reservas (MVP)
-- ============================================
-- Editor visual de plano de salón + motor de slots fijos + reserva con
-- asignación automática de mesa.
--
-- Una sola sucursal por negocio en MVP, pero el schema permite varios
-- floor_plans por business para soportar "Salón / Terraza" en Fase 2 sin
-- migración destructiva.
--
-- Anti-doble-booking: exclusion constraint con btree_gist sobre
-- (table_id, tstzrange(starts_at, ends_at)) filtrado a estados vivos
-- (confirmed, seated). Concurrent inserts en la misma mesa/horario fallan
-- con SQLSTATE 23P01 → la app reintenta con otra mesa o devuelve "no hay
-- lugar".
-- ============================================

create extension if not exists btree_gist;

-- ── 1. floor_plans ────────────────────────────────────────
-- Plano del salón. width/height son coordenadas lógicas (no píxeles); el
-- editor SVG usa viewBox = "0 0 width height" así el render escala con el
-- contenedor.
create table public.floor_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null default 'Salón',
  width int not null default 1000 check (width > 0),
  height int not null default 700 check (height > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index floor_plans_business_idx on public.floor_plans (business_id);

create trigger floor_plans_set_updated_at
  before update on public.floor_plans
  for each row execute function public.set_updated_at();

-- ── 2. tables ─────────────────────────────────────────────
-- Mesas posicionables dentro del plano. shape define el render (círculo /
-- cuadrado / rectángulo). x,y son la esquina superior-izquierda; rotation
-- en grados. status='disabled' la oculta del motor de disponibilidad sin
-- borrarla (preserva el historial de reservations).
create table public.tables (
  id uuid primary key default gen_random_uuid(),
  floor_plan_id uuid not null references public.floor_plans(id) on delete cascade,
  label text not null,
  seats int not null check (seats > 0),
  shape text not null check (shape in ('circle', 'square', 'rect')),
  x int not null,
  y int not null,
  width int not null check (width > 0),
  height int not null check (height > 0),
  rotation int not null default 0,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now()
);

create index tables_floor_plan_idx on public.tables (floor_plan_id);

-- ── 3. reservation_settings ───────────────────────────────
-- Una fila por business. schedule es un JSON con la forma:
--   {
--     "0": { "open": false, "slots": [] },
--     "1": { "open": true,  "slots": ["12:00","13:30","20:30","22:00"] },
--     ...
--   }
-- Las claves son day_of_week 0..6 (0=domingo). slots son strings "HH:MM"
-- en hora local del negocio (la TZ viene de businesses.timezone; el
-- motor de availability combina date + slot en timestamptz).
create table public.reservation_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  slot_duration_min int not null default 90 check (slot_duration_min > 0),
  buffer_min int not null default 15 check (buffer_min >= 0),
  lead_time_min int not null default 60 check (lead_time_min >= 0),
  advance_days_max int not null default 30 check (advance_days_max > 0),
  max_party_size int not null default 12 check (max_party_size > 0),
  schedule jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger reservation_settings_set_updated_at
  before update on public.reservation_settings
  for each row execute function public.set_updated_at();

-- ── 4. reservations ───────────────────────────────────────
-- table_id es nullable: si la mesa se elimina del plano, las reservas
-- históricas quedan huérfanas pero legibles (status final).
-- user_id referencia auth.users; si el cliente borra su cuenta, el
-- registro queda con user_id NULL pero los snapshots customer_name /
-- customer_phone preservan los datos para que el local pueda contactar.
create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  table_id uuid references public.tables(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  party_size int not null check (party_size > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'seated', 'completed', 'no_show', 'cancelled')),
  notes text,
  source text not null default 'web' check (source in ('web', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_time_valid check (ends_at > starts_at)
);

create index reservations_business_starts_idx on public.reservations (business_id, starts_at);
create index reservations_user_idx on public.reservations (user_id) where user_id is not null;
create index reservations_table_starts_idx on public.reservations (table_id, starts_at)
  where table_id is not null;

-- Anti-overlap: solo reservas vivas (confirmed/seated) ocupan la mesa.
-- Las completed / no_show / cancelled liberan el slot.
alter table public.reservations
  add constraint reservations_no_overlap
  exclude using gist (
    table_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('confirmed', 'seated') and table_id is not null);

create trigger reservations_set_updated_at
  before update on public.reservations
  for each row execute function public.set_updated_at();

-- ── 5. RLS ────────────────────────────────────────────────
alter table public.floor_plans enable row level security;
alter table public.tables enable row level security;
alter table public.reservation_settings enable row level security;
alter table public.reservations enable row level security;

-- ── floor_plans: admin del business CRUD; público solo SELECT (necesario
--    para que el cliente vea el plano si en el futuro lo mostramos en la
--    UI de reserva; por ahora no se usa, pero abrir el SELECT a anon es
--    inocuo: son coordenadas de mesas).
create policy "public_select_floor_plans" on public.floor_plans
  for select to anon, authenticated
  using (true);

create policy "admin_insert_floor_plans" on public.floor_plans
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "admin_update_floor_plans" on public.floor_plans
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "admin_delete_floor_plans" on public.floor_plans
  for delete to authenticated
  using (public.is_business_member(business_id));

-- ── tables: SELECT público (mismo razonamiento que floor_plans), CUD
--    solo admin del business padre.
create policy "public_select_tables" on public.tables
  for select to anon, authenticated
  using (true);

create policy "admin_insert_tables" on public.tables
  for insert to authenticated
  with check (exists (
    select 1 from public.floor_plans fp
    where fp.id = tables.floor_plan_id
      and public.is_business_member(fp.business_id)
  ));

create policy "admin_update_tables" on public.tables
  for update to authenticated
  using (exists (
    select 1 from public.floor_plans fp
    where fp.id = tables.floor_plan_id
      and public.is_business_member(fp.business_id)
  ))
  with check (exists (
    select 1 from public.floor_plans fp
    where fp.id = tables.floor_plan_id
      and public.is_business_member(fp.business_id)
  ));

create policy "admin_delete_tables" on public.tables
  for delete to authenticated
  using (exists (
    select 1 from public.floor_plans fp
    where fp.id = tables.floor_plan_id
      and public.is_business_member(fp.business_id)
  ));

-- ── reservation_settings: SELECT público (el cliente necesita conocer
--    schedule + advance_days_max + max_party_size para construir el
--    calendar/picker antes de loguearse). CUD solo admin.
create policy "public_select_reservation_settings" on public.reservation_settings
  for select to anon, authenticated
  using (true);

create policy "admin_insert_reservation_settings" on public.reservation_settings
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "admin_update_reservation_settings" on public.reservation_settings
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "admin_delete_reservation_settings" on public.reservation_settings
  for delete to authenticated
  using (public.is_business_member(business_id));

-- ── reservations:
--  - Admin del business: full CRUD sobre reservas del negocio.
--  - Cliente logueado: SELECT y UPDATE solo de sus propias reservas
--    (para ver historial / cancelar). El INSERT lo hacemos vía server
--    action con service_role para correr la asignación atómica + retry,
--    así que no abrimos INSERT directo a authenticated.
create policy "admin_select_reservations" on public.reservations
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "admin_insert_reservations" on public.reservations
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "admin_update_reservations" on public.reservations
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "admin_delete_reservations" on public.reservations
  for delete to authenticated
  using (public.is_business_member(business_id));

create policy "customer_select_own_reservations" on public.reservations
  for select to authenticated
  using (user_id = auth.uid());

create policy "customer_update_own_reservations" on public.reservations
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
