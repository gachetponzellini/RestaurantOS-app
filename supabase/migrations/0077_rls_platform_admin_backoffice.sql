-- ============================================
-- Spec 26 — RLS: el platform admin ve/gestiona todo el back-office
-- ============================================
-- El spec 19 consolidó las tablas core/hot agregándoles `OR is_platform_admin()`,
-- pero se salteó un conjunto de tablas de back-office más viejas (migraciones
-- ~0017–0019, 0021, 0037, 0047, 0057). Sus policies solo chequean
-- `is_business_member(business_id)`, así que un platform admin NO miembro del
-- negocio veía listas vacías (Promociones, Campañas, Menú del día…) y no podía
-- escribir, pese a que `canManageBusiness` ya le da gestión total.
--
-- Acá completamos el patrón ya establecido: `(... is_business_member(...) ...)
-- OR is_platform_admin()`. No se toca la condición de miembro → los usuarios
-- normales siguen exactamente igual; solo se suma al platform admin (flag que
-- solo tiene el equipo de plataforma).
--
-- FUERA DE ESTA MIGRACIÓN (a propósito):
--   • storage.objects (buckets supplier-invoices / floor-plans / products): ya
--     tienen policies companion `platform_*` (creadas aparte) que conceden acceso
--     al platform admin vía OR de policies permisivas. No hace falta tocarlas.
--   • reservations (write): insert/update/delete pasan por el service client en
--     las server actions (gateadas por `canManage`, que ya incluye platform admin),
--     no por RLS; la RLS de escritura es un backstop role-aware (is_business_staff,
--     spec 22) que se mantiene. Solo se ajusta `reservations_select` (lectura SSR).
-- ============================================

-- ── promo_codes (0018) ───────────────────────────────────────────
drop policy if exists admin_select_promo_codes on public.promo_codes;
create policy admin_select_promo_codes on public.promo_codes
  for select to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists admin_insert_promo_codes on public.promo_codes;
create policy admin_insert_promo_codes on public.promo_codes
  for insert to authenticated
  with check (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists admin_update_promo_codes on public.promo_codes;
create policy admin_update_promo_codes on public.promo_codes
  for update to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin())
  with check (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists admin_delete_promo_codes on public.promo_codes;
create policy admin_delete_promo_codes on public.promo_codes
  for delete to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

-- ── campaigns (0019) ─────────────────────────────────────────────
drop policy if exists admin_select_campaigns on public.campaigns;
create policy admin_select_campaigns on public.campaigns
  for select to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists admin_insert_campaigns on public.campaigns;
create policy admin_insert_campaigns on public.campaigns
  for insert to authenticated
  with check (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists admin_update_campaigns on public.campaigns;
create policy admin_update_campaigns on public.campaigns
  for update to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin())
  with check (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists admin_delete_campaigns on public.campaigns;
create policy admin_delete_campaigns on public.campaigns
  for delete to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

-- ── campaign_messages (0019) — acceso derivado vía campaign padre ─
drop policy if exists admin_select_campaign_messages on public.campaign_messages;
create policy admin_select_campaign_messages on public.campaign_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_messages.campaign_id
        and public.is_business_member(c.business_id)
    )
    or public.is_platform_admin()
  );

drop policy if exists admin_update_campaign_messages on public.campaign_messages;
create policy admin_update_campaign_messages on public.campaign_messages
  for update to authenticated
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_messages.campaign_id
        and public.is_business_member(c.business_id)
    )
    or public.is_platform_admin()
  );

-- ── daily_menus (0017) ───────────────────────────────────────────
drop policy if exists admin_select_daily_menus on public.daily_menus;
create policy admin_select_daily_menus on public.daily_menus
  for select to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists admin_insert_daily_menus on public.daily_menus;
create policy admin_insert_daily_menus on public.daily_menus
  for insert to authenticated
  with check (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists admin_update_daily_menus on public.daily_menus;
create policy admin_update_daily_menus on public.daily_menus
  for update to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin())
  with check (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists admin_delete_daily_menus on public.daily_menus;
create policy admin_delete_daily_menus on public.daily_menus
  for delete to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

-- ── daily_menu_components (0017) — acceso derivado vía menú padre ─
drop policy if exists admin_select_daily_menu_components on public.daily_menu_components;
create policy admin_select_daily_menu_components on public.daily_menu_components
  for select to authenticated
  using (
    exists (
      select 1 from public.daily_menus m
      where m.id = daily_menu_components.menu_id
        and public.is_business_member(m.business_id)
    )
    or public.is_platform_admin()
  );

drop policy if exists admin_insert_daily_menu_components on public.daily_menu_components;
create policy admin_insert_daily_menu_components on public.daily_menu_components
  for insert to authenticated
  with check (
    exists (
      select 1 from public.daily_menus m
      where m.id = daily_menu_components.menu_id
        and public.is_business_member(m.business_id)
    )
    or public.is_platform_admin()
  );

drop policy if exists admin_update_daily_menu_components on public.daily_menu_components;
create policy admin_update_daily_menu_components on public.daily_menu_components
  for update to authenticated
  using (
    exists (
      select 1 from public.daily_menus m
      where m.id = daily_menu_components.menu_id
        and public.is_business_member(m.business_id)
    )
    or public.is_platform_admin()
  )
  with check (
    exists (
      select 1 from public.daily_menus m
      where m.id = daily_menu_components.menu_id
        and public.is_business_member(m.business_id)
    )
    or public.is_platform_admin()
  );

drop policy if exists admin_delete_daily_menu_components on public.daily_menu_components;
create policy admin_delete_daily_menu_components on public.daily_menu_components
  for delete to authenticated
  using (
    exists (
      select 1 from public.daily_menus m
      where m.id = daily_menu_components.menu_id
        and public.is_business_member(m.business_id)
    )
    or public.is_platform_admin()
  );

-- ── caja_cortes (0037) — solo insert + select (cortes inmutables) ─
drop policy if exists members_select_caja_cortes on public.caja_cortes;
create policy members_select_caja_cortes on public.caja_cortes
  for select to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists members_insert_caja_cortes on public.caja_cortes;
create policy members_insert_caja_cortes on public.caja_cortes
  for insert to authenticated
  with check (public.is_business_member(business_id) or public.is_platform_admin());

-- ── reservations (0021/0073) — SOLO select (ver nota de cabecera) ─
drop policy if exists reservations_select on public.reservations;
create policy reservations_select on public.reservations
  for select to authenticated
  using (
    public.is_business_member(business_id)
    or public.is_platform_admin()
    or user_id = (select auth.uid())
  );

-- ── payment_method_configs (0047) — select tenía OR duplicado ─────
drop policy if exists payment_method_configs_select on public.payment_method_configs;
create policy payment_method_configs_select on public.payment_method_configs
  for select to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists payment_method_configs_insert on public.payment_method_configs;
create policy payment_method_configs_insert on public.payment_method_configs
  for insert to authenticated
  with check (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists payment_method_configs_update on public.payment_method_configs;
create policy payment_method_configs_update on public.payment_method_configs
  for update to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin())
  with check (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists payment_method_configs_delete on public.payment_method_configs;
create policy payment_method_configs_delete on public.payment_method_configs
  for delete to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

-- ── business_hours (0057) — select ya tenía platform admin ───────
drop policy if exists business_hours_insert on public.business_hours;
create policy business_hours_insert on public.business_hours
  for insert to authenticated
  with check (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists business_hours_update on public.business_hours;
create policy business_hours_update on public.business_hours
  for update to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin())
  with check (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists business_hours_delete on public.business_hours;
create policy business_hours_delete on public.business_hours
  for delete to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

-- ── floor_plans (0021) — select público (true) se mantiene ───────
drop policy if exists admin_insert_floor_plans on public.floor_plans;
create policy admin_insert_floor_plans on public.floor_plans
  for insert to authenticated
  with check (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists admin_update_floor_plans on public.floor_plans;
create policy admin_update_floor_plans on public.floor_plans
  for update to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin())
  with check (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists admin_delete_floor_plans on public.floor_plans;
create policy admin_delete_floor_plans on public.floor_plans
  for delete to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

-- ── tables (0021) — acceso derivado vía floor_plan padre ─────────
drop policy if exists admin_insert_tables on public.tables;
create policy admin_insert_tables on public.tables
  for insert to authenticated
  with check (
    exists (
      select 1 from public.floor_plans fp
      where fp.id = tables.floor_plan_id
        and public.is_business_member(fp.business_id)
    )
    or public.is_platform_admin()
  );

drop policy if exists admin_update_tables on public.tables;
create policy admin_update_tables on public.tables
  for update to authenticated
  using (
    exists (
      select 1 from public.floor_plans fp
      where fp.id = tables.floor_plan_id
        and public.is_business_member(fp.business_id)
    )
    or public.is_platform_admin()
  )
  with check (
    exists (
      select 1 from public.floor_plans fp
      where fp.id = tables.floor_plan_id
        and public.is_business_member(fp.business_id)
    )
    or public.is_platform_admin()
  );

drop policy if exists admin_delete_tables on public.tables;
create policy admin_delete_tables on public.tables
  for delete to authenticated
  using (
    exists (
      select 1 from public.floor_plans fp
      where fp.id = tables.floor_plan_id
        and public.is_business_member(fp.business_id)
    )
    or public.is_platform_admin()
  );

-- ── reservation_settings (0021) — select público (true) se mantiene
drop policy if exists admin_insert_reservation_settings on public.reservation_settings;
create policy admin_insert_reservation_settings on public.reservation_settings
  for insert to authenticated
  with check (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists admin_update_reservation_settings on public.reservation_settings;
create policy admin_update_reservation_settings on public.reservation_settings
  for update to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin())
  with check (public.is_business_member(business_id) or public.is_platform_admin());

drop policy if exists admin_delete_reservation_settings on public.reservation_settings;
create policy admin_delete_reservation_settings on public.reservation_settings
  for delete to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());

-- ── Cleanup de duplicados que dejó la consolidación del spec 19 ──
-- stock_items_select quedó como `is_platform_admin() OR is_platform_admin()
-- OR is_business_member(...)`. Lo normalizamos (cosmético, mismo set de filas).
drop policy if exists stock_items_select on public.stock_items;
create policy stock_items_select on public.stock_items
  for select to authenticated
  using (public.is_business_member(business_id) or public.is_platform_admin());
