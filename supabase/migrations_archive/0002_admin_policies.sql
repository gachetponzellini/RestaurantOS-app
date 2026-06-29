-- ============================================
-- Helper: is the current user a member of the business?
-- ============================================
create or replace function public.is_business_member(bid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select exists (
    select 1 from public.business_users
    where business_id = bid and user_id = auth.uid()
  );
$$;

grant execute on function public.is_business_member(uuid) to authenticated;

-- ============================================
-- businesses: own business only
-- ============================================
create policy "admin_select_own_business" on businesses
  for select to authenticated
  using (public.is_business_member(id));

-- ============================================
-- business_users: rows of own business
-- ============================================
create policy "admin_select_business_users" on business_users
  for select to authenticated
  using (public.is_business_member(business_id));

-- ============================================
-- users: self
-- ============================================
create policy "self_select_users" on users
  for select to authenticated
  using (id = auth.uid());

-- ============================================
-- catalog (read-only from admin in MVP-0)
-- ============================================
create policy "admin_select_products" on products
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "admin_select_categories" on categories
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "admin_select_modifier_groups" on modifier_groups
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "admin_select_modifiers" on modifiers
  for select to authenticated
  using (exists (
    select 1 from modifier_groups g
    where g.id = modifiers.group_id
      and public.is_business_member(g.business_id)
  ));

create policy "admin_select_business_hours" on business_hours
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "admin_select_delivery_zones" on delivery_zones
  for select to authenticated
  using (public.is_business_member(business_id));

-- ============================================
-- customers + addresses
-- ============================================
create policy "admin_select_customers" on customers
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "admin_select_customer_addresses" on customer_addresses
  for select to authenticated
  using (exists (
    select 1 from customers c
    where c.id = customer_addresses.customer_id
      and public.is_business_member(c.business_id)
  ));

-- ============================================
-- orders + items + modifiers + history
-- ============================================
create policy "admin_select_orders" on orders
  for select to authenticated
  using (public.is_business_member(business_id));

create policy "admin_update_orders" on orders
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "admin_select_order_items" on order_items
  for select to authenticated
  using (exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and public.is_business_member(o.business_id)
  ));

create policy "admin_select_order_item_modifiers" on order_item_modifiers
  for select to authenticated
  using (exists (
    select 1 from order_items i
    join orders o on o.id = i.order_id
    where i.id = order_item_modifiers.order_item_id
      and public.is_business_member(o.business_id)
  ));

create policy "admin_select_order_status_history" on order_status_history
  for select to authenticated
  using (exists (
    select 1 from orders o
    where o.id = order_status_history.order_id
      and public.is_business_member(o.business_id)
  ));

-- ============================================
-- Realtime: expose orders changes to the admin dashboard
-- ============================================
alter publication supabase_realtime add table orders;
