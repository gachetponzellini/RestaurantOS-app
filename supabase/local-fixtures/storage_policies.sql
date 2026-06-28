-- ─────────────────────────────────────────────────────────────────────────
-- Policies de storage.objects para el LOCAL.
--
-- `db-load-cloud-schema` recrea SOLO el schema `public` desde el dump del cloud,
-- así que las policies del schema `storage` (creadas por las migraciones
-- 0004/0007/0022/0054) nunca llegaban al local → cualquier upload de un usuario
-- authenticated fallaba con "new row violates row-level security policy"
-- (favicon/logo en configuración, plano de salón, factura de proveedor, etc.).
--
-- Este fixture replica el estado del cloud (fuente de verdad) y lo aplica el
-- script de carga después del dump. Idempotente (drop if exists + create).
-- Si cambian en el cloud, regenerar desde pg_policies del cloud.
-- ─────────────────────────────────────────────────────────────────────────

-- INSERT
drop policy if exists admin_insert_floor_plans_storage on storage.objects;
create policy admin_insert_floor_plans_storage on storage.objects for insert to authenticated
  with check ((bucket_id = 'floor-plans') and is_business_member(((string_to_array(name, '/'))[1])::uuid));
drop policy if exists admin_insert_products_storage on storage.objects;
create policy admin_insert_products_storage on storage.objects for insert to authenticated
  with check ((bucket_id = 'products') and is_business_member(((string_to_array(name, '/'))[1])::uuid));
drop policy if exists member_insert_supplier_invoices_storage on storage.objects;
create policy member_insert_supplier_invoices_storage on storage.objects for insert to authenticated
  with check ((bucket_id = 'supplier-invoices') and is_business_member(((string_to_array(name, '/'))[1])::uuid));
drop policy if exists platform_insert_floor_plans_storage on storage.objects;
create policy platform_insert_floor_plans_storage on storage.objects for insert to authenticated
  with check ((bucket_id = 'floor-plans') and is_platform_admin());
drop policy if exists platform_insert_products_storage on storage.objects;
create policy platform_insert_products_storage on storage.objects for insert to authenticated
  with check ((bucket_id = 'products') and is_platform_admin());
drop policy if exists platform_insert_supplier_invoices_storage on storage.objects;
create policy platform_insert_supplier_invoices_storage on storage.objects for insert to authenticated
  with check ((bucket_id = 'supplier-invoices') and is_platform_admin());

-- UPDATE
drop policy if exists admin_update_floor_plans_storage on storage.objects;
create policy admin_update_floor_plans_storage on storage.objects for update to authenticated
  using ((bucket_id = 'floor-plans') and is_business_member(((string_to_array(name, '/'))[1])::uuid));
drop policy if exists admin_update_products_storage on storage.objects;
create policy admin_update_products_storage on storage.objects for update to authenticated
  using ((bucket_id = 'products') and is_business_member(((string_to_array(name, '/'))[1])::uuid));
drop policy if exists member_update_supplier_invoices_storage on storage.objects;
create policy member_update_supplier_invoices_storage on storage.objects for update to authenticated
  using ((bucket_id = 'supplier-invoices') and is_business_member(((string_to_array(name, '/'))[1])::uuid));
drop policy if exists platform_update_floor_plans_storage on storage.objects;
create policy platform_update_floor_plans_storage on storage.objects for update to authenticated
  using ((bucket_id = 'floor-plans') and is_platform_admin());
drop policy if exists platform_update_products_storage on storage.objects;
create policy platform_update_products_storage on storage.objects for update to authenticated
  using ((bucket_id = 'products') and is_platform_admin());
drop policy if exists platform_update_supplier_invoices_storage on storage.objects;
create policy platform_update_supplier_invoices_storage on storage.objects for update to authenticated
  using ((bucket_id = 'supplier-invoices') and is_platform_admin());

-- DELETE
drop policy if exists admin_delete_floor_plans_storage on storage.objects;
create policy admin_delete_floor_plans_storage on storage.objects for delete to authenticated
  using ((bucket_id = 'floor-plans') and is_business_member(((string_to_array(name, '/'))[1])::uuid));
drop policy if exists admin_delete_products_storage on storage.objects;
create policy admin_delete_products_storage on storage.objects for delete to authenticated
  using ((bucket_id = 'products') and is_business_member(((string_to_array(name, '/'))[1])::uuid));
drop policy if exists member_delete_supplier_invoices_storage on storage.objects;
create policy member_delete_supplier_invoices_storage on storage.objects for delete to authenticated
  using ((bucket_id = 'supplier-invoices') and is_business_member(((string_to_array(name, '/'))[1])::uuid));
drop policy if exists platform_delete_floor_plans_storage on storage.objects;
create policy platform_delete_floor_plans_storage on storage.objects for delete to authenticated
  using ((bucket_id = 'floor-plans') and is_platform_admin());
drop policy if exists platform_delete_products_storage on storage.objects;
create policy platform_delete_products_storage on storage.objects for delete to authenticated
  using ((bucket_id = 'products') and is_platform_admin());
drop policy if exists platform_delete_supplier_invoices_storage on storage.objects;
create policy platform_delete_supplier_invoices_storage on storage.objects for delete to authenticated
  using ((bucket_id = 'supplier-invoices') and is_platform_admin());
