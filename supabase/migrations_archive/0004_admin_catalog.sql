-- ============================================
-- Admin mutations on catalog tables
-- ============================================

-- categories
create policy "admin_insert_categories" on categories
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "admin_update_categories" on categories
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "admin_delete_categories" on categories
  for delete to authenticated
  using (public.is_business_member(business_id));

-- products
create policy "admin_insert_products" on products
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "admin_update_products" on products
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "admin_delete_products" on products
  for delete to authenticated
  using (public.is_business_member(business_id));

-- modifier_groups
create policy "admin_insert_modifier_groups" on modifier_groups
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "admin_update_modifier_groups" on modifier_groups
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "admin_delete_modifier_groups" on modifier_groups
  for delete to authenticated
  using (public.is_business_member(business_id));

-- modifiers (business_id inferred through modifier_groups)
create policy "admin_insert_modifiers" on modifiers
  for insert to authenticated
  with check (exists (
    select 1 from modifier_groups g
    where g.id = modifiers.group_id
      and public.is_business_member(g.business_id)
  ));

create policy "admin_update_modifiers" on modifiers
  for update to authenticated
  using (exists (
    select 1 from modifier_groups g
    where g.id = modifiers.group_id
      and public.is_business_member(g.business_id)
  ))
  with check (exists (
    select 1 from modifier_groups g
    where g.id = modifiers.group_id
      and public.is_business_member(g.business_id)
  ));

create policy "admin_delete_modifiers" on modifiers
  for delete to authenticated
  using (exists (
    select 1 from modifier_groups g
    where g.id = modifiers.group_id
      and public.is_business_member(g.business_id)
  ));

-- ============================================
-- Storage: product images
-- Public read, authed write restricted to files whose path starts
-- with the business_id the user belongs to.
-- Object path convention: <business_id>/<uuid>.<ext>
-- ============================================
insert into storage.buckets (id, name, public)
values ('products', 'products', true)
on conflict (id) do nothing;

create policy "public_read_products"
  on storage.objects for select
  using (bucket_id = 'products');

create policy "admin_insert_products_storage"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'products'
    and public.is_business_member((string_to_array(name, '/'))[1]::uuid)
  );

create policy "admin_update_products_storage"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'products'
    and public.is_business_member((string_to_array(name, '/'))[1]::uuid)
  );

create policy "admin_delete_products_storage"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'products'
    and public.is_business_member((string_to_array(name, '/'))[1]::uuid)
  );
