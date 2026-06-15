-- 0067 · auth.uid() en subquery + consolidar policies con acceso self/customer
-- (spec 19 · DT-024 + DT-019)
--
-- Cierra auth_rls_initplan: toda referencia directa a auth.uid() pasa a (select auth.uid()) → el planner
-- la evalúa 1× por query, no por fila. De paso consolida las tablas que mezclan acceso admin/platform
-- con acceso del propio usuario (customer/self). OR de los predicados = semántica idéntica.

-- ── customers · SELECT (admin + self + platform → 1) ──────────────────────
drop policy if exists admin_select_customers        on public.customers;
drop policy if exists customer_select_own_customer  on public.customers;
drop policy if exists platform_select_customers     on public.customers;
create policy customers_select on public.customers for select to authenticated
using (
  is_business_member(business_id)
  or is_platform_admin()
  or user_id = (select auth.uid())
);

-- ── order_item_modifiers · SELECT (admin + self + platform → 1) ───────────
drop policy if exists admin_select_order_item_modifiers          on public.order_item_modifiers;
drop policy if exists customer_select_own_order_item_modifiers   on public.order_item_modifiers;
drop policy if exists platform_select_order_item_modifiers       on public.order_item_modifiers;
create policy order_item_modifiers_select on public.order_item_modifiers for select to authenticated
using (
  exists (select 1 from public.order_items i
            join public.orders o on o.id = i.order_id
          where i.id = order_item_modifiers.order_item_id and is_business_member(o.business_id))
  or is_platform_admin()
  or exists (select 1 from public.order_items i
               join public.orders o on o.id = i.order_id
               join public.customers c on c.id = o.customer_id
             where i.id = order_item_modifiers.order_item_id and c.user_id = (select auth.uid()))
);

-- ── reservations · SELECT y UPDATE (admin + self → 1 c/u) ─────────────────
drop policy if exists admin_select_reservations          on public.reservations;
drop policy if exists customer_select_own_reservations   on public.reservations;
create policy reservations_select on public.reservations for select to authenticated
using (is_business_member(business_id) or user_id = (select auth.uid()));

drop policy if exists admin_update_reservations          on public.reservations;
drop policy if exists customer_update_own_reservations   on public.reservations;
create policy reservations_update on public.reservations for update to authenticated
using       (is_business_member(business_id) or user_id = (select auth.uid()))
with check  (is_business_member(business_id) or user_id = (select auth.uid()));

-- ── users · SELECT (platform + self → 1) ──────────────────────────────────
drop policy if exists platform_select_all_users on public.users;
drop policy if exists self_select_users         on public.users;
create policy users_select on public.users for select to authenticated
using (is_platform_admin() or id = (select auth.uid()));

-- ── business_groups · owner_select_groups (wrap, sin consolidar) ──────────
alter policy owner_select_groups on public.business_groups
  using (owner_user_id = (select auth.uid()));

-- ── clock_entries · clock_entries_select (wrap, role public) ──────────────
alter policy clock_entries_select on public.clock_entries
  using (business_id in (
    select business_users.business_id from public.business_users
    where business_users.user_id = (select auth.uid()) and business_users.disabled_at is null
  ));
