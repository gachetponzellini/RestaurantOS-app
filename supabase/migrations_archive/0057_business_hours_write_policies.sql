-- Allow business admins/managers to manage their own business hours.
-- Read policies already exist in 0002 (admin_select_business_hours)
-- and 0007 (platform_select_business_hours).

create policy "admin_insert_business_hours" on business_hours
  for insert to authenticated
  with check (public.is_business_member(business_id));

create policy "admin_update_business_hours" on business_hours
  for update to authenticated
  using (public.is_business_member(business_id))
  with check (public.is_business_member(business_id));

create policy "admin_delete_business_hours" on business_hours
  for delete to authenticated
  using (public.is_business_member(business_id));
