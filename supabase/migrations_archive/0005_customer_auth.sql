-- ============================================
-- Customers can be linked to auth.users (logged in via Google).
-- One auth user ↔ one customer row per business.
-- ============================================
alter table customers
  add column user_id uuid references auth.users(id) on delete set null;

create unique index customers_business_user_unique
  on customers (business_id, user_id)
  where user_id is not null;

create index customers_user_id_idx on customers (user_id);

-- ============================================
-- Customer self-service RLS policies
-- A logged-in customer can see their own orders + items + modifiers.
-- Writes continue to go through the service role (createOrder action).
-- ============================================
create policy "customer_select_own_customer" on customers
  for select to authenticated
  using (user_id = auth.uid());

create policy "customer_select_own_orders" on orders
  for select to authenticated
  using (
    customer_id is not null
    and exists (
      select 1 from customers c
      where c.id = orders.customer_id
        and c.user_id = auth.uid()
    )
  );

create policy "customer_select_own_order_items" on order_items
  for select to authenticated
  using (exists (
    select 1 from orders o
    join customers c on c.id = o.customer_id
    where o.id = order_items.order_id
      and c.user_id = auth.uid()
  ));

create policy "customer_select_own_order_item_modifiers"
  on order_item_modifiers
  for select to authenticated
  using (exists (
    select 1 from order_items i
    join orders o on o.id = i.order_id
    join customers c on c.id = o.customer_id
    where i.id = order_item_modifiers.order_item_id
      and c.user_id = auth.uid()
  ));
