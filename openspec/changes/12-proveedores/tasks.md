# Tareas — 12-proveedores Módulo nuevo de Proveedores

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.
> Módulo nuevo (greenfield) bajo el patrón AGENTS.md §3. Dinero en centavos, timezone AR,
> scope `business_id` + RLS, mutaciones en Server Actions validadas con Zod.
> La última migración real es `0051`; usar placeholder `00NN_*` (número definitivo al implementar).

## 1. Datos

- [ ] Migración `supabase/migrations/00NN_proveedores.sql`:
  - [ ] `suppliers (id, business_id, name, cuit, contact, phone, email, notes, is_active, created_at,
        updated_at)` — `unique (business_id, name)`, índice por `business_id`.
  - [ ] `supplier_invoices (id, business_id, supplier_id, invoice_number, invoice_date, total_cents,
        photo_url, notes, created_by, created_at)` — `total_cents int >= 0`, índices por
        `(business_id, invoice_date)` y `supplier_id`.
  - [ ] `supplier_ingredients (supplier_id, ingredient_id, business_id, created_at)` — N:N proveedor↔insumo,
        PK/`unique (supplier_id, ingredient_id)`.
  - [ ] Bucket `supplier-invoices` en `storage.buckets` (privado) + policies en `storage.objects`
        (`is_business_member((string_to_array(name,'/'))[1]::uuid)` para CRUD + platform admin), copiando
        el patrón de `0022_floor_plan_background.sql` pero **sin lectura pública**.
  - [ ] RLS `members_*` + `platform_*` por `business_id` en las tres tablas.
- [ ] `pnpm db:types` → `src/lib/supabase/database.types.ts`.

## 2. Dominio (TDD)

### 2a. Tipos y esquemas
- [ ] `src/lib/proveedores/types.ts` (Supplier, SupplierInvoice, SupplierStats, …).
- [ ] `src/lib/proveedores/schema.ts` (Zod: SupplierInput, SupplierInvoiceInput, import batch).

### 2b. CRUD de proveedores
- [ ] Test (rojo): `src/lib/proveedores/proveedores.integration.test.ts` — alta/edición/baja, unicidad
      `(business_id, name)`, RLS por negocio, permiso `admin`/`encargado`.
- [ ] `src/lib/proveedores/actions.ts` — `createSupplier` / `updateSupplier` / `deactivateSupplier`
      (Zod + check de rol).
- [ ] `src/lib/proveedores/queries.ts` — `getSuppliers` / `getSupplierById`.

### 2c. Facturas con foto
- [ ] Test (rojo): alta de factura con `total_cents`, `photo_url`, `created_by`; sin CAE/ARCA.
- [ ] `actions.ts` — `createSupplierInvoice` (la foto se sube en cliente al bucket; la action recibe la
      URL/path). Validar `total_cents` entero ≥ 0.

### 2d. Estadística y relación con salidas (lógica pura)
- [ ] Test (rojo): `src/lib/proveedores/<stats>.test.ts` — agregación por proveedor (conteo, total en
      centavos, último comprobante) por rango de fechas; cruce proveedor→insumo→salida (estimativo).
- [ ] `src/lib/proveedores/<stats>.ts` (pura) + queries server `getSupplierStats` y
      `getSupplierProductOutflow` (base para el cambio 16).

### 2e. Import masivo
- [ ] Test (rojo): validación Zod del lote + upsert idempotente por `(business_id, name)` + reporte
      OK/error sin abortar.
- [ ] `actions.ts` — `importSuppliers` (check rol `admin`/`encargado`; devuelve resumen).

### 2f. Permisos
- [ ] (Opcional) `canManageProveedores` en `src/lib/permissions/can.ts` si se centraliza el check.

## 3. UI

- [ ] `src/components/admin/proveedores/` — lista, form de alta/edición, detalle con foto, estadística,
      vínculo proveedor↔insumos, importador. Reutilizar `src/components/admin/catalog/image-uploader.tsx`
      (bucket `supplier-invoices`).
- [ ] Ruta `src/app/[business_slug]/admin/(authed)/proveedores/page.tsx` (+ subrutas).
- [ ] Formateo de dinero con `src/lib/currency.ts`.

## 4. Verify

- [ ] `pnpm typecheck` y `pnpm test` en verde.
- [ ] Revisión fresca de archivos tocados.
- [ ] Marcar ✅ en `openspec/changes/README.md`.
