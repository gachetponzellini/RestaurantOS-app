-- ═══════════════════════════════════════════════════════════════════════
-- 0049_stock.sql — Stock tracking para bebidas y vinos (CU-10)
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Toggle en products
alter table products
  add column track_stock boolean not null default false;

-- 2. Tabla stock_items
create table stock_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  current_qty int not null default 0,
  min_qty int not null default 0,
  unit text not null default 'unidad',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, product_id)
);

create index stock_items_business_idx on stock_items(business_id);

-- 3. Tabla stock_movimientos
create table stock_movimientos (
  id uuid primary key default gen_random_uuid(),
  stock_item_id uuid not null references stock_items(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  kind text not null check (kind in ('ingreso', 'venta', 'ajuste')),
  qty int not null,
  order_item_id uuid references order_items(id) on delete set null,
  reason text,
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);

create index stock_movimientos_item_idx
  on stock_movimientos(stock_item_id, created_at desc);
create index stock_movimientos_business_idx
  on stock_movimientos(business_id);

-- 4. RLS
alter table stock_items enable row level security;
alter table stock_movimientos enable row level security;

create policy "members_select_stock_items" on stock_items
  for select to authenticated using (public.is_business_member(business_id));
create policy "members_insert_stock_items" on stock_items
  for insert to authenticated with check (public.is_business_member(business_id));
create policy "members_update_stock_items" on stock_items
  for update to authenticated using (public.is_business_member(business_id));
create policy "members_delete_stock_items" on stock_items
  for delete to authenticated using (public.is_business_member(business_id));

create policy "members_select_stock_movimientos" on stock_movimientos
  for select to authenticated using (public.is_business_member(business_id));
create policy "members_insert_stock_movimientos" on stock_movimientos
  for insert to authenticated with check (public.is_business_member(business_id));

create policy "platform_select_stock_items" on stock_items
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_stock_items" on stock_items
  for all to authenticated using (public.is_platform_admin());

create policy "platform_select_stock_movimientos" on stock_movimientos
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_stock_movimientos" on stock_movimientos
  for all to authenticated using (public.is_platform_admin());

-- 5. Trigger: descuento automático al insertar order_item
create or replace function fn_stock_descuento_on_order_item()
returns trigger language plpgsql security definer as $$
declare
  v_stock_item_id uuid;
  v_business_id uuid;
begin
  if not exists (select 1 from products where id = new.product_id and track_stock = true) then
    return new;
  end if;

  select si.id, si.business_id into v_stock_item_id, v_business_id
    from stock_items si where si.product_id = new.product_id;

  if v_stock_item_id is null then
    return new;
  end if;

  update stock_items
    set current_qty = current_qty - new.quantity,
        updated_at = now()
    where id = v_stock_item_id;

  insert into stock_movimientos (stock_item_id, business_id, kind, qty, order_item_id)
    values (v_stock_item_id, v_business_id, 'venta', -new.quantity, new.id);

  if (select current_qty from stock_items where id = v_stock_item_id) <= 0 then
    update products set is_available = false where id = new.product_id;
  end if;

  return new;
end;
$$;

create trigger trg_stock_descuento
  after insert on order_items
  for each row execute function fn_stock_descuento_on_order_item();
