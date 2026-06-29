-- ============================================
-- EXTENSIONS
-- ============================================
create extension if not exists "pgcrypto";

-- ============================================
-- TENANCY
-- ============================================
create table businesses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  timezone text not null default 'America/Argentina/Buenos_Aires',
  currency text not null default 'ARS',
  phone text,
  email text,
  address text,
  lat numeric(10,7),
  lng numeric(10,7),
  logo_url text,
  settings jsonb not null default '{}'::jsonb,
  plan text default 'basic',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  created_at timestamptz not null default now()
);

create table business_users (
  business_id uuid references businesses(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  role text not null check (role in ('owner','admin','staff')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index on business_users (user_id);

-- ============================================
-- HORARIOS Y ZONAS
-- ============================================
create table business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  opens_at time not null,
  closes_at time not null
);

create index on business_hours (business_id, day_of_week);

create table delivery_zones (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  delivery_fee_cents bigint not null,
  min_order_cents bigint default 0,
  estimated_minutes int,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create index on delivery_zones (business_id);

-- ============================================
-- CATÁLOGO
-- ============================================
create table categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  slug text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  unique (business_id, slug)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  name text not null,
  slug text not null,
  description text,
  price_cents bigint not null,
  image_url text,
  is_available boolean not null default true,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (business_id, slug)
);

create index on products (business_id, category_id);
create index on products (business_id) where is_active = true;

create table modifier_groups (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  min_selection int not null default 0,
  max_selection int not null default 1,
  is_required boolean not null default false,
  sort_order int not null default 0
);

create index on modifier_groups (product_id);

create table modifiers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references modifier_groups(id) on delete cascade,
  name text not null,
  price_delta_cents bigint not null default 0,
  is_available boolean not null default true,
  sort_order int not null default 0
);

create index on modifiers (group_id);

-- ============================================
-- CLIENTES Y DIRECCIONES
-- ============================================
create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  phone text not null,
  name text,
  email text,
  created_at timestamptz not null default now(),
  unique (business_id, phone)
);

create table customer_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  label text,
  street text not null,
  number text,
  apartment text,
  notes text,
  lat numeric(10,7),
  lng numeric(10,7),
  delivery_zone_id uuid references delivery_zones(id),
  created_at timestamptz not null default now()
);

create index on customer_addresses (customer_id);

-- ============================================
-- PEDIDOS
-- ============================================
create table orders (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  order_number int not null,
  customer_id uuid references customers(id),

  -- snapshot (los datos "congelados" al momento del pedido)
  customer_name text not null,
  customer_phone text not null,
  delivery_type text not null check (delivery_type in ('delivery','pickup')),
  delivery_address text,
  delivery_lat numeric(10,7),
  delivery_lng numeric(10,7),
  delivery_zone_id uuid references delivery_zones(id),
  delivery_notes text,

  status text not null default 'pending'
    check (status in ('pending','confirmed','preparing','ready','on_the_way','delivered','cancelled')),

  -- montos calculados server-side en createOrder
  subtotal_cents bigint not null,
  delivery_fee_cents bigint not null default 0,
  discount_cents bigint not null default 0,
  total_cents bigint not null,

  payment_method text not null default 'cash_on_delivery',
  payment_status text not null default 'pending'
    check (payment_status in ('pending','paid','failed','refunded')),

  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, order_number)
);

create index on orders (business_id, status, created_at desc);
create index on orders (business_id, created_at desc);
create index on orders (customer_id);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id),
  product_name text not null,       -- snapshot
  unit_price_cents bigint not null, -- snapshot base price (sin modifiers)
  quantity int not null check (quantity > 0),
  notes text,
  -- subtotal_cents = (unit_price_cents + sum(order_item_modifiers.price_delta_cents)) * quantity
  subtotal_cents bigint not null
);

create index on order_items (order_id);

create table order_item_modifiers (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references order_items(id) on delete cascade,
  modifier_id uuid references modifiers(id),
  modifier_name text not null,         -- snapshot
  price_delta_cents bigint not null    -- snapshot
);

create index on order_item_modifiers (order_item_id);

create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  status text not null,
  changed_by uuid references users(id),
  notes text,
  created_at timestamptz not null default now()
);

create index on order_status_history (order_id, created_at desc);

-- ============================================
-- TRIGGERS
-- ============================================

-- Correlativo de order_number por business con advisory lock para
-- evitar race condition en inserts concurrentes. hashtextextended
-- da un bigint determinístico a partir del uuid.
create or replace function set_order_number()
returns trigger
language plpgsql
as $$
declare
  lock_key bigint;
begin
  if new.order_number is null or new.order_number = 0 then
    lock_key := hashtextextended(new.business_id::text, 0);
    perform pg_advisory_xact_lock(lock_key);

    select coalesce(max(order_number), 0) + 1
    into new.order_number
    from orders
    where business_id = new.business_id;
  end if;
  return new;
end;
$$;

create trigger orders_set_order_number
before insert on orders
for each row
execute function set_order_number();

-- updated_at automático
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger orders_set_updated_at
before update on orders
for each row
execute function set_updated_at();

-- Historial de cambios de estado
create or replace function log_order_status_change()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    insert into order_status_history (order_id, status, notes)
    values (new.id, new.status, new.cancelled_reason);
  end if;
  return new;
end;
$$;

create trigger orders_log_status_change
after update on orders
for each row
execute function log_order_status_change();

-- Estado inicial en history al crear
create or replace function log_order_initial_status()
returns trigger
language plpgsql
as $$
begin
  insert into order_status_history (order_id, status)
  values (new.id, new.status);
  return new;
end;
$$;

create trigger orders_log_initial_status
after insert on orders
for each row
execute function log_order_initial_status();

-- ============================================
-- RLS ON en todas (policies del admin en 0002)
-- ============================================
alter table businesses enable row level security;
alter table users enable row level security;
alter table business_users enable row level security;
alter table business_hours enable row level security;
alter table delivery_zones enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table modifier_groups enable row level security;
alter table modifiers enable row level security;
alter table customers enable row level security;
alter table customer_addresses enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table order_item_modifiers enable row level security;
alter table order_status_history enable row level security;
