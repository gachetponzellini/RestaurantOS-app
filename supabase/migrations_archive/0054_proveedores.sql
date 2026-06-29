-- ═══════════════════════════════════════════════════════════════════════
-- 0054 — Módulo de Proveedores (spec 12)
-- CRUD proveedores, facturas de compra con foto, vínculo N:N con insumos.
-- Bucket privado para fotos de factura (no público como products/floor-plans).
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────
-- 1. suppliers (proveedores)
-- ─────────────────────────────────────────────────────────────────────

create table suppliers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  cuit text,
  contact text,
  phone text,
  email text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create index suppliers_business_idx on suppliers(business_id);

create trigger suppliers_set_updated_at
  before update on suppliers
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- 2. supplier_invoices (facturas de compra)
-- ─────────────────────────────────────────────────────────────────────

create table supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  supplier_id uuid not null references suppliers(id) on delete cascade,
  invoice_number text,
  invoice_date date not null,
  total_cents integer not null check (total_cents >= 0),
  photo_url text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index supplier_invoices_biz_date_idx
  on supplier_invoices(business_id, invoice_date);
create index supplier_invoices_supplier_idx
  on supplier_invoices(supplier_id);

-- ─────────────────────────────────────────────────────────────────────
-- 3. supplier_ingredients (N:N proveedor ↔ insumo)
--    business_id denormalizado para RLS simple (evita join).
-- ─────────────────────────────────────────────────────────────────────

create table supplier_ingredients (
  supplier_id uuid not null references suppliers(id) on delete cascade,
  ingredient_id uuid not null references ingredients(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (supplier_id, ingredient_id)
);

-- ─────────────────────────────────────────────────────────────────────
-- 4. RLS — members + platform en las tres tablas
-- ─────────────────────────────────────────────────────────────────────

alter table suppliers enable row level security;
alter table supplier_invoices enable row level security;
alter table supplier_ingredients enable row level security;

-- suppliers
create policy "members_select_suppliers" on suppliers
  for select to authenticated using (public.is_business_member(business_id));
create policy "members_insert_suppliers" on suppliers
  for insert to authenticated with check (public.is_business_member(business_id));
create policy "members_update_suppliers" on suppliers
  for update to authenticated using (public.is_business_member(business_id));
create policy "members_delete_suppliers" on suppliers
  for delete to authenticated using (public.is_business_member(business_id));

create policy "platform_select_suppliers" on suppliers
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_suppliers" on suppliers
  for all to authenticated using (public.is_platform_admin());

-- supplier_invoices
create policy "members_select_supplier_invoices" on supplier_invoices
  for select to authenticated using (public.is_business_member(business_id));
create policy "members_insert_supplier_invoices" on supplier_invoices
  for insert to authenticated with check (public.is_business_member(business_id));
create policy "members_update_supplier_invoices" on supplier_invoices
  for update to authenticated using (public.is_business_member(business_id));
create policy "members_delete_supplier_invoices" on supplier_invoices
  for delete to authenticated using (public.is_business_member(business_id));

create policy "platform_select_supplier_invoices" on supplier_invoices
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_supplier_invoices" on supplier_invoices
  for all to authenticated using (public.is_platform_admin());

-- supplier_ingredients
create policy "members_select_supplier_ingredients" on supplier_ingredients
  for select to authenticated using (public.is_business_member(business_id));
create policy "members_insert_supplier_ingredients" on supplier_ingredients
  for insert to authenticated with check (public.is_business_member(business_id));
create policy "members_delete_supplier_ingredients" on supplier_ingredients
  for delete to authenticated using (public.is_business_member(business_id));

create policy "platform_select_supplier_ingredients" on supplier_ingredients
  for select to authenticated using (public.is_platform_admin());
create policy "platform_all_supplier_ingredients" on supplier_ingredients
  for all to authenticated using (public.is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────
-- 5. Storage bucket: supplier-invoices (PRIVADO)
--    A diferencia de products/floor-plans (public=true), este bucket
--    requiere membresía del negocio para leer (fotos de factura pueden
--    tener datos sensibles). Se usan signed URLs para mostrar en UI.
-- ─────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('supplier-invoices', 'supplier-invoices', false)
on conflict (id) do nothing;

-- Members: CRUD sobre su prefijo de negocio
create policy "member_select_supplier_invoices_storage"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'supplier-invoices'
    and public.is_business_member((string_to_array(name, '/'))[1]::uuid)
  );

create policy "member_insert_supplier_invoices_storage"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'supplier-invoices'
    and public.is_business_member((string_to_array(name, '/'))[1]::uuid)
  );

create policy "member_update_supplier_invoices_storage"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'supplier-invoices'
    and public.is_business_member((string_to_array(name, '/'))[1]::uuid)
  );

create policy "member_delete_supplier_invoices_storage"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'supplier-invoices'
    and public.is_business_member((string_to_array(name, '/'))[1]::uuid)
  );

-- Platform admin: gestión completa
create policy "platform_select_supplier_invoices_storage"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'supplier-invoices' and public.is_platform_admin());

create policy "platform_insert_supplier_invoices_storage"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'supplier-invoices' and public.is_platform_admin());

create policy "platform_update_supplier_invoices_storage"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'supplier-invoices' and public.is_platform_admin());

create policy "platform_delete_supplier_invoices_storage"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'supplier-invoices' and public.is_platform_admin());
