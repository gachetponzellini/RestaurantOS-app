-- ============================================
-- CU-00 · Dominio de comandas (sectores + tickets multi-estación)
-- ============================================
-- Capa de datos del corazón operativo del MVP POS interna.
--
-- Modelo:
--   stations           → sectores configurables del local (Cocina, Parrilla, ...).
--   comandas           → un ticket por (order, station, batch).
--   comanda_items      → n:m entre comanda y order_items.
--
-- Routing de un item al sector: products.station_id (override) >
-- categories.station_id (default) > null (no se rutea — error en app).
-- station_id se denormaliza en order_items al insertar para que la cocina
-- lea por sector con un único índice y para que recategorizar después no
-- "mueva" comandas históricas (snapshot, mismo principio que product_name).
--
-- Ver: wiki/casos-de-uso/CU-00-crud-comandas.md (decisiones D-CU00-1..6).
-- ============================================

-- ── 1. stations ────────────────────────────────────────────
-- Sectores configurables por business. is_active sirve para "deshabilitar"
-- un sector sin perder histórico (las comandas viejas siguen apuntando).
create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id, name)
);

create index stations_business_idx on public.stations (business_id);

alter table public.stations enable row level security;

create policy "members_select_stations" on public.stations
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "members_insert_stations" on public.stations
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "members_update_stations" on public.stations
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "members_delete_stations" on public.stations
  for delete to authenticated
  using (public.is_business_member(business_id));

-- ── 2. categories.station_id (default por categoría) ──────
alter table public.categories
  add column if not exists station_id uuid references public.stations(id) on delete set null;

create index if not exists categories_station_idx
  on public.categories (station_id)
  where station_id is not null;

-- ── 3. products.station_id (override por producto) ────────
alter table public.products
  add column if not exists station_id uuid references public.stations(id) on delete set null;

create index if not exists products_station_idx
  on public.products (station_id)
  where station_id is not null;

-- ── 4. orders: lifecycle_status + mozo_id ─────────────────
-- lifecycle_status es ortogonal al status delivery existente. Para órdenes
-- delivery, status='delivered' implica lifecycle='closed' (lo deriva la app).
-- Para dine_in la orden nace 'open' al primer envío y pasa a 'closed' al
-- cobrar (Bloque 5).
alter table public.orders
  add column if not exists lifecycle_status text not null default 'open'
    check (lifecycle_status in ('open', 'closed', 'cancelled'));

alter table public.orders
  add column if not exists mozo_id uuid references public.users(id) on delete set null;

create index if not exists orders_lifecycle_idx
  on public.orders (business_id, lifecycle_status)
  where lifecycle_status = 'open';

create index if not exists orders_mozo_idx
  on public.orders (mozo_id)
  where mozo_id is not null;

-- Una sola orden 'open' por mesa. Esto es invariante de negocio (CU-01:
-- "solo puede haber un pedido al mismo tiempo por mesa"). El partial unique
-- index hace que cualquier intento concurrente de crear una segunda orden
-- abierta sobre la misma mesa falle con SQLSTATE 23505 — la app detecta y
-- usa la existente.
create unique index if not exists orders_one_open_per_table
  on public.orders (table_id)
  where lifecycle_status = 'open' and table_id is not null;

-- ── 5. order_items: station_id + loaded_by + cancelled ────
alter table public.order_items
  add column if not exists station_id uuid references public.stations(id) on delete set null;

alter table public.order_items
  add column if not exists loaded_by uuid references public.users(id) on delete set null;

alter table public.order_items
  add column if not exists cancelled_at timestamptz;

alter table public.order_items
  add column if not exists cancelled_reason text;

create index if not exists order_items_station_idx
  on public.order_items (station_id)
  where station_id is not null;

-- ── 6. comandas ───────────────────────────────────────────
-- Un ticket por (order, station, batch). El batch arranca en 1 y se
-- incrementa por cada nuevo envío al mismo sector dentro de la misma orden:
-- "Mesa 18 · Cocina · Tanda 2".
create table if not exists public.comandas (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete restrict,
  batch int not null check (batch > 0),
  status text not null default 'pendiente'
    check (status in ('pendiente', 'en_preparacion', 'listo', 'entregado')),
  emitted_at timestamptz not null default now(),
  ready_at timestamptz,
  delivered_at timestamptz,
  unique (order_id, station_id, batch)
);

create index comandas_station_status_idx
  on public.comandas (station_id, status, emitted_at);

create index comandas_order_idx on public.comandas (order_id);

alter table public.comandas enable row level security;

create policy "members_select_comandas" on public.comandas
  for select to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = comandas.order_id
      and public.is_business_member(o.business_id)
  ));

create policy "members_insert_comandas" on public.comandas
  for insert to authenticated
  with check (exists (
    select 1 from public.orders o
    where o.id = comandas.order_id
      and public.is_business_member(o.business_id)
  ));

create policy "members_update_comandas" on public.comandas
  for update to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = comandas.order_id
      and public.is_business_member(o.business_id)
  ))
  with check (exists (
    select 1 from public.orders o
    where o.id = comandas.order_id
      and public.is_business_member(o.business_id)
  ));

-- ── 7. comanda_items (n:m) ────────────────────────────────
create table if not exists public.comanda_items (
  comanda_id uuid not null references public.comandas(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  primary key (comanda_id, order_item_id)
);

create index comanda_items_order_item_idx on public.comanda_items (order_item_id);

alter table public.comanda_items enable row level security;

create policy "members_select_comanda_items" on public.comanda_items
  for select to authenticated
  using (exists (
    select 1 from public.comandas c
    join public.orders o on o.id = c.order_id
    where c.id = comanda_items.comanda_id
      and public.is_business_member(o.business_id)
  ));

create policy "members_insert_comanda_items" on public.comanda_items
  for insert to authenticated
  with check (exists (
    select 1 from public.comandas c
    join public.orders o on o.id = c.order_id
    where c.id = comanda_items.comanda_id
      and public.is_business_member(o.business_id)
  ));

-- Realtime: NO se cablea en este bloque. Polling 5-10s alcanza para MVP
-- (P6 del plan-maestro). Cuando haga falta se agrega `alter publication
-- supabase_realtime add table` y los suscriptores correspondientes.
