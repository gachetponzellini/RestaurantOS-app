-- ============================================
-- Platform admin: extend access to every business's admin-side data.
-- Adds PERMISSIVE policies alongside the existing `admin_*` ones; Postgres
-- OR-combines permissive policies of the same action.
-- ============================================

-- orders
create policy "platform_select_orders" on orders
  for select to authenticated
  using (public.is_platform_admin());

create policy "platform_update_orders" on orders
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- order_items
create policy "platform_select_order_items" on order_items
  for select to authenticated
  using (public.is_platform_admin());

-- order_item_modifiers
create policy "platform_select_order_item_modifiers" on order_item_modifiers
  for select to authenticated
  using (public.is_platform_admin());

-- order_status_history
create policy "platform_select_order_status_history" on order_status_history
  for select to authenticated
  using (public.is_platform_admin());

-- customers
create policy "platform_select_customers" on customers
  for select to authenticated
  using (public.is_platform_admin());

-- customer_addresses
create policy "platform_select_customer_addresses" on customer_addresses
  for select to authenticated
  using (public.is_platform_admin());

-- products (CRUD)
create policy "platform_select_products" on products
  for select to authenticated
  using (public.is_platform_admin());

create policy "platform_insert_products" on products
  for insert to authenticated
  with check (public.is_platform_admin());

create policy "platform_update_products" on products
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "platform_delete_products" on products
  for delete to authenticated
  using (public.is_platform_admin());

-- categories (CRUD)
create policy "platform_select_categories" on categories
  for select to authenticated
  using (public.is_platform_admin());

create policy "platform_insert_categories" on categories
  for insert to authenticated
  with check (public.is_platform_admin());

create policy "platform_update_categories" on categories
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "platform_delete_categories" on categories
  for delete to authenticated
  using (public.is_platform_admin());

-- modifier_groups (CRUD)
create policy "platform_select_modifier_groups" on modifier_groups
  for select to authenticated
  using (public.is_platform_admin());

create policy "platform_insert_modifier_groups" on modifier_groups
  for insert to authenticated
  with check (public.is_platform_admin());

create policy "platform_update_modifier_groups" on modifier_groups
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "platform_delete_modifier_groups" on modifier_groups
  for delete to authenticated
  using (public.is_platform_admin());

-- modifiers (CRUD)
create policy "platform_select_modifiers" on modifiers
  for select to authenticated
  using (public.is_platform_admin());

create policy "platform_insert_modifiers" on modifiers
  for insert to authenticated
  with check (public.is_platform_admin());

create policy "platform_update_modifiers" on modifiers
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "platform_delete_modifiers" on modifiers
  for delete to authenticated
  using (public.is_platform_admin());

-- business_hours
create policy "platform_select_business_hours" on business_hours
  for select to authenticated
  using (public.is_platform_admin());

-- delivery_zones
create policy "platform_select_delivery_zones" on delivery_zones
  for select to authenticated
  using (public.is_platform_admin());

-- storage: product images bucket — platform admin can manage any prefix
create policy "platform_insert_products_storage"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'products' and public.is_platform_admin()
  );

create policy "platform_update_products_storage"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'products' and public.is_platform_admin()
  );

create policy "platform_delete_products_storage"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'products' and public.is_platform_admin()
  );
