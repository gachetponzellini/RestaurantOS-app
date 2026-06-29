-- ============================================
-- Stations: policies para platform admin
-- ============================================
-- Mismo patrón que 0032 (super_categories): la tabla `stations` (creada en
-- 0025) tiene policies "members_*" via `is_business_member` pero le falta
-- el set "platform_*" via `is_platform_admin()` para que platform admins
-- sin business_users membership puedan operar.
--
-- Síntoma sin esto: error 42501 RLS al crear/editar/borrar sectores desde
-- la UI con un user platform admin.

create policy "platform_select_stations" on public.stations
  for select to authenticated
  using (public.is_platform_admin());

create policy "platform_insert_stations" on public.stations
  for insert to authenticated
  with check (public.is_platform_admin());

create policy "platform_update_stations" on public.stations
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "platform_delete_stations" on public.stations
  for delete to authenticated
  using (public.is_platform_admin());
