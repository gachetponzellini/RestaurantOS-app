-- ============================================
-- Bug fix · super_categories: policies para platform admin
-- ============================================
-- Migración 0031 creó super_categories con policies "members_*" basadas en
-- `is_business_member`. Pero en migración 0007 las policies de catálogo
-- (categories, products, etc.) ganaron pares "platform_*" basados en
-- `is_platform_admin()`, que se OR-ean con las members_* (Postgres aplica
-- OR entre policies del mismo comando). Sin estas, un platform admin sin
-- business_users membership no puede operar la nueva tabla.
--
-- Síntoma: al crear/editar/borrar supercategorías desde la UI con un user
-- platform admin sin membership: error 42501 "row-level security policy".

create policy "platform_select_super_categories" on public.super_categories
  for select to authenticated
  using (public.is_platform_admin());

create policy "platform_insert_super_categories" on public.super_categories
  for insert to authenticated
  with check (public.is_platform_admin());

create policy "platform_update_super_categories" on public.super_categories
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "platform_delete_super_categories" on public.super_categories
  for delete to authenticated
  using (public.is_platform_admin());
