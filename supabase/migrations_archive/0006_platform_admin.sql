-- ============================================
-- Platform admin: a user that can manage all businesses on the platform.
-- Flagged via boolean column on public.users. Set manually via script.
-- ============================================
alter table users
  add column is_platform_admin boolean not null default false;

create or replace function public.is_platform_admin()
returns boolean
language sql
security definer
stable
set search_path = public, auth
as $$
  select coalesce(
    (select is_platform_admin from public.users where id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_platform_admin() to authenticated;

-- ============================================
-- Platform admin policies: manage all businesses + members
-- ============================================

-- businesses: select all + insert + update
create policy "platform_select_all_businesses" on businesses
  for select to authenticated
  using (public.is_platform_admin());

create policy "platform_insert_businesses" on businesses
  for insert to authenticated
  with check (public.is_platform_admin());

create policy "platform_update_businesses" on businesses
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- business_users: select all + insert + delete (add/remove members)
create policy "platform_select_all_business_users" on business_users
  for select to authenticated
  using (public.is_platform_admin());

create policy "platform_insert_business_users" on business_users
  for insert to authenticated
  with check (public.is_platform_admin());

create policy "platform_delete_business_users" on business_users
  for delete to authenticated
  using (public.is_platform_admin());

-- users: platform admin can see all users
create policy "platform_select_all_users" on users
  for select to authenticated
  using (public.is_platform_admin());

-- Platform admin is allowed to see catalog, orders, etc. of any business
-- via is_business_member OR is_platform_admin. For now, mutations remain
-- scoped to is_business_member (platform admins don't manage catalogs
-- directly — they create the business + invite the owner who then manages it).
