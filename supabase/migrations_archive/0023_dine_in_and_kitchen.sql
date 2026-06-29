-- ============================================
-- Mozo + Cocina: dine-in, estados de mesa y de cocina
-- ============================================

-- 1. Extender delivery_type en orders para incluir 'dine_in'
alter table public.orders
  drop constraint if exists orders_delivery_type_check;

alter table public.orders
  add constraint orders_delivery_type_check
  check (delivery_type in ('delivery', 'pickup', 'dine_in'));

-- 2. Agregar table_id a orders (FK opcional; null si no es dine_in)
alter table public.orders
  add column if not exists table_id uuid references public.tables(id) on delete set null;

create index if not exists orders_table_id_idx on public.orders (table_id);

-- 3. Estado operacional de la mesa (distinto del status active/disabled del plano)
alter table public.tables
  add column if not exists operational_status text not null default 'libre'
    check (operational_status in ('libre', 'ocupada', 'esperando_pedido', 'esperando_cuenta', 'limpiar')),
  add column if not exists current_order_id uuid references public.orders(id) on delete set null,
  add column if not exists opened_at timestamptz;

-- 4. Estado de cocina por item
alter table public.order_items
  add column if not exists kitchen_status text not null default 'pending'
    check (kitchen_status in ('pending', 'preparing', 'ready', 'delivered'));

create index if not exists order_items_kitchen_status_idx on public.order_items (kitchen_status);
