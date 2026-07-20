-- 0019 — Cerrar la escritura directa de catálogo por roles no-manager (security review #5)
--
-- El gate de las server actions de catálogo (requireCatalogManager) ya exige
-- admin/encargado, PERO la RLS de escritura de las tablas de catálogo era
-- `is_business_member (cualquier rol) OR is_platform_admin`. Como los writes de
-- las actions van por el cliente RLS (JWT del caller), un mozo/personal podía
-- saltarse las actions y escribir precios/productos DIRECTO contra PostgREST con
-- la publishable key + su JWT. Este gap lo detectó la verificación adversarial.
--
-- Solución: un helper `is_business_manager` (admin/encargado, + platform admin) y
-- endurecer las policies de escritura de catálogo a ese rol. Las lecturas
-- (SELECT) quedan igual (is_business_member): el mozo sigue viendo la carta. Los
-- únicos writers de estas tablas son las actions gateadas (verificado en código)
-- que corren como admin/encargado, así que el camino feliz no se rompe.

-- ── Helper: manager del negocio = admin o encargado (o platform admin) ──────
create or replace function public.is_business_manager(bid uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path to 'public', 'auth'
as $function$
  select exists (
    select 1 from public.business_users
    where business_id = bid
      and user_id = auth.uid()
      and role in ('admin', 'encargado')
      and disabled_at is null
  ) or public.is_platform_admin();
$function$;

grant execute on function public.is_business_manager(uuid) to anon, authenticated, service_role;

-- ── Endurecer las policies de escritura (INSERT/UPDATE/DELETE) ──────────────
-- products
alter policy products_insert on public.products with check (public.is_business_manager(business_id));
alter policy products_update on public.products using (public.is_business_manager(business_id)) with check (public.is_business_manager(business_id));
alter policy products_delete on public.products using (public.is_business_manager(business_id));

-- categories
alter policy categories_insert on public.categories with check (public.is_business_manager(business_id));
alter policy categories_update on public.categories using (public.is_business_manager(business_id)) with check (public.is_business_manager(business_id));
alter policy categories_delete on public.categories using (public.is_business_manager(business_id));

-- super_categories
alter policy super_categories_insert on public.super_categories with check (public.is_business_manager(business_id));
alter policy super_categories_update on public.super_categories using (public.is_business_manager(business_id)) with check (public.is_business_manager(business_id));
alter policy super_categories_delete on public.super_categories using (public.is_business_manager(business_id));

-- daily_menus
alter policy admin_insert_daily_menus on public.daily_menus with check (public.is_business_manager(business_id));
alter policy admin_update_daily_menus on public.daily_menus using (public.is_business_manager(business_id)) with check (public.is_business_manager(business_id));
alter policy admin_delete_daily_menus on public.daily_menus using (public.is_business_manager(business_id));

-- stations
alter policy stations_insert on public.stations with check (public.is_business_manager(business_id));
alter policy stations_update on public.stations using (public.is_business_manager(business_id)) with check (public.is_business_manager(business_id));
alter policy stations_delete on public.stations using (public.is_business_manager(business_id));

-- modifier_groups
alter policy modifier_groups_insert on public.modifier_groups with check (public.is_business_manager(business_id));
alter policy modifier_groups_update on public.modifier_groups using (public.is_business_manager(business_id)) with check (public.is_business_manager(business_id));
alter policy modifier_groups_delete on public.modifier_groups using (public.is_business_manager(business_id));

-- modifiers (scopeados vía modifier_groups.business_id)
alter policy modifiers_insert on public.modifiers
  with check (exists (select 1 from public.modifier_groups g where g.id = modifiers.group_id and public.is_business_manager(g.business_id)));
alter policy modifiers_update on public.modifiers
  using (exists (select 1 from public.modifier_groups g where g.id = modifiers.group_id and public.is_business_manager(g.business_id)))
  with check (exists (select 1 from public.modifier_groups g where g.id = modifiers.group_id and public.is_business_manager(g.business_id)));
alter policy modifiers_delete on public.modifiers
  using (exists (select 1 from public.modifier_groups g where g.id = modifiers.group_id and public.is_business_manager(g.business_id)));
