-- 0065 · Consolidar policies permisivas + auth.uid() en subquery — tablas calientes
-- (spec 19 · DT-019 + DT-024)
--
-- Tablas: orders, order_items, payments. Todas las policies son PERMISSIVE para `authenticated`.
-- Postgres ya combina múltiples permisivas del mismo comando con OR; acá hacemos ese OR explícito en
-- UNA policy por (tabla, comando) → set de filas visible idéntico por construcción (refactor seguro).
-- De paso, `auth.uid()` directo pasa a `(select auth.uid())` para que el planner lo evalúe 1× por query
-- (no por fila) → cierra auth_rls_initplan en estas tablas.
--
-- Helpers is_business_member / is_platform_admin se conservan (no son auth.* primitivos; el advisor no
-- los marca, y dependen de la fila → no son initplan-eables).

-- ── orders ───────────────────────────────────────────────────────────────
drop policy if exists admin_select_orders        on public.orders;
drop policy if exists customer_select_own_orders on public.orders;
drop policy if exists platform_select_orders     on public.orders;
create policy orders_select on public.orders for select to authenticated
using (
  is_business_member(business_id)
  or is_platform_admin()
  or (customer_id is not null and exists (
        select 1 from public.customers c
        where c.id = orders.customer_id and c.user_id = (select auth.uid())
     ))
);

drop policy if exists admin_update_orders    on public.orders;
drop policy if exists platform_update_orders on public.orders;
create policy orders_update on public.orders for update to authenticated
using       (is_business_member(business_id) or is_platform_admin())
with check  (is_business_member(business_id) or is_platform_admin());

-- ── order_items ────────────────────────────────────────────────────────────
drop policy if exists admin_select_order_items         on public.order_items;
drop policy if exists customer_select_own_order_items  on public.order_items;
drop policy if exists platform_select_order_items      on public.order_items;
create policy order_items_select on public.order_items for select to authenticated
using (
  exists (select 1 from public.orders o
          where o.id = order_items.order_id and is_business_member(o.business_id))
  or is_platform_admin()
  or exists (select 1 from public.orders o
               join public.customers c on c.id = o.customer_id
             where o.id = order_items.order_id and c.user_id = (select auth.uid()))
);

-- ── payments ─────────────────────────────────────────────────────────────
drop policy if exists members_insert_payments  on public.payments;
drop policy if exists platform_insert_payments on public.payments;
create policy payments_insert on public.payments for insert to authenticated
with check (is_business_member(business_id) or is_platform_admin());

drop policy if exists members_select_payments  on public.payments;
drop policy if exists platform_select_payments on public.payments;
create policy payments_select on public.payments for select to authenticated
using (is_business_member(business_id) or is_platform_admin());

drop policy if exists members_update_payments  on public.payments;
drop policy if exists platform_update_payments on public.payments;
create policy payments_update on public.payments for update to authenticated
using       (is_business_member(business_id) or is_platform_admin())
with check  (is_business_member(business_id) or is_platform_admin());
