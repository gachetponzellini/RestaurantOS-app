# 12-proveedores — Módulo nuevo de Proveedores: foto de factura, carga del comprobante, estadística e import

> Estado: 📋 propuesto · Origen: Reunión §3.1 (Accionables · equipo dev) · §7.20 (Proveedores, a implementar) · §4 (Analítica · estadística a medida) · §3.1 (importar proveedores) · Design: no

## Por qué

Proveedores es uno de los **3 módulos que faltan** (§2 / §7.22) y **no existe en el código**: no hay
`src/lib/proveedores`, ni tablas de proveedores, ni área de UI. Hoy la única mención a "proveedor" es un
**string de motivo** en el board de caja (`src/components/admin/local/caja-admin-board.tsx`: movimiento
"pago a proveedor"), que no modela al proveedor ni su factura.

La reunión (§7.20 y §3.1) pidió un módulo nuevo que:

1. **Suba la foto de la factura del proveedor** y **cargue la factura** (datos básicos del comprobante:
   proveedor, fecha, número, total).
2. Ofrezca **estadística de proveedores** ("no tan específica") y la **relación proveedor ↔ salida de
   productos** (lo pidió Tommy; se cruza con analítica — cambio **16**).
3. Permita **importar proveedores desde el Excel de MaxiRest** (carga masiva), igual que insumos.

Como es **greenfield**, se sigue el patrón de módulo de dominio de AGENTS.md §3 (`src/lib/<dominio>/` con
`actions.ts`/`queries.ts`/`schema.ts`/`types.ts`), nueva migración + RLS, área en `src/components/admin/`,
y un **storage bucket** para las fotos de factura copiando la convención de `floor-plans`/`products`
(`0022`/`0007`: path `<business_id>/<uuid>.<ext>`, RLS por `is_business_member`).

## Qué cambia

- **Módulo de dominio nuevo `src/lib/proveedores/`**: CRUD de proveedores (nombre, CUIT, contacto,
  notas) scopeado por `business_id`, con `actions.ts` (mutaciones Zod), `queries.ts` (lecturas),
  `schema.ts`/`types.ts`.
- **Facturas de proveedor con foto**: alta de comprobante (proveedor, fecha, número, **total en
  centavos**, foto) — la imagen se sube a un **bucket nuevo** `supplier-invoices` y se guarda su URL en la
  factura. La carga es de **datos básicos del comprobante** (no integración fiscal: nada de CAE/ARCA; eso
  es facturación de venta, cambio 13).
- **Estadística de proveedores**: query de resumen por proveedor y período (timezone AR): cantidad de
  facturas, total gastado en centavos, último comprobante.
- **Relación proveedor ↔ salida de productos**: vínculo entre proveedor e **insumos** (`ingredients`,
  `0050`) que provee, de modo que la analítica pueda cruzar lo comprado a un proveedor con la **salida de
  esos insumos** (`ingredient_consumptions`, `0051`). Acá se modela el vínculo y la query base; el reporte
  cruzado a medida se consume desde el cambio **16**.
- **Import masivo de proveedores** desde Excel/CSV de MaxiRest: Server Action que valida un lote con Zod y
  hace upsert por `(business_id, name)` (o `(business_id, cuit)`), reportando filas OK y con error.

## Alcance

**Incluye:**
- Tablas nuevas de **proveedores** y **facturas de proveedor** (+ vínculo proveedor↔insumo) con RLS.
- **Bucket de storage** `supplier-invoices` (foto de factura) con RLS por `business_id`, convención de
  path `<business_id>/<uuid>.<ext>`.
- Módulo `src/lib/proveedores/` (`actions.ts`/`queries.ts`/`schema.ts`/`types.ts`) + lógica pura testeable.
- Área de UI `src/components/admin/proveedores/` (lista, alta, detalle con foto, estadística, importador) +
  ruta `src/app/[business_slug]/admin/(authed)/proveedores/`.
- **Estadística de proveedores** y **query base proveedor↔salida de productos**.
- **Import masivo** de proveedores.

**No incluye (fuera de alcance):**
- **OCR / lectura automática de la factura**: se sube la foto y se cargan los datos **a mano**. Auto-extracción queda como futuro.
- **Facturación de venta / ARCA-AFIP**: cambio **13**. Estas son facturas **de compra** del proveedor, sin
  CAE ni emisión fiscal.
- **Pago a proveedor desde caja**: el movimiento "pago a proveedor" de caja
  (`src/components/admin/local/caja-admin-board.tsx`) puede luego referenciar un proveedor, pero
  integrarlo al flujo de caja queda fuera de este cambio.
- **Reporte cruzado a medida proveedor↔salida** en analítica: se consume en el cambio **16**; acá sólo la
  query base y el vínculo de datos.
- **Import de insumos**: cambio **10** (acá sólo proveedores).

## Impacto

- **Archivos** (nuevos, reales por convención §3):
  - `src/lib/proveedores/actions.ts` — alta/edición/baja de proveedor, alta de factura (con upload de
    foto), import masivo; todas con Zod + check de rol.
  - `src/lib/proveedores/queries.ts` — listado, detalle, estadística por proveedor, query base
    proveedor↔salida de productos.
  - `src/lib/proveedores/schema.ts` / `types.ts` — esquemas Zod y tipos de dominio.
  - `src/lib/proveedores/<stats>.ts` — lógica pura de agregación (testeable).
  - `src/components/admin/proveedores/` — UI (lista, form, detalle con foto, estadística, importador).
    Reutiliza el patrón de `src/components/admin/catalog/image-uploader.tsx` para subir la foto.
  - `src/app/[business_slug]/admin/(authed)/proveedores/page.tsx` (+ subrutas).
- **Datos:** nueva migración `supabase/migrations/00NN_proveedores.sql` (número definitivo al implementar;
  última real `0051`). Crea:
  - `suppliers (id, business_id, name, cuit, contact, phone, email, notes, is_active, created_at,
    updated_at)` — `unique (business_id, name)`.
  - `supplier_invoices (id, business_id, supplier_id, invoice_number, invoice_date, total_cents,
    photo_url, notes, created_by, created_at)` — `total_cents` entero ≥ 0.
  - `supplier_ingredients (supplier_id, ingredient_id, …)` — vínculo N:N proveedor↔insumo
    (`ingredients`, `0050`) para el cruce con salidas.
  - Bucket `supplier-invoices` en `storage.buckets` + policies en `storage.objects`
    (`is_business_member((string_to_array(name,'/'))[1]::uuid)` + platform admin), copiando `0022`.
  - RLS `members_*` + `platform_*` por `business_id` en las tres tablas.
- **Tipos:** regenerar `pnpm db:types` → `src/lib/supabase/database.types.ts`.
- **Permisos:** gestionar proveedores/facturas/import → `admin`/`encargado` (mismo criterio que stock,
  `src/lib/stock/actions.ts`). Si se centraliza, agregar `canManageProveedores` en
  `src/lib/permissions/can.ts`.
- **Integraciones:** **Supabase Storage** (bucket `supplier-invoices`). NO ARCA/AFIP (son facturas de
  compra). Cruce con analítica: cambio **16**.

## Riesgos

- **Foto de factura puede contener datos sensibles** → bucket con RLS por `business_id` (no público por
  defecto, a diferencia de `products`/`floor-plans`): la lectura debe exigir membresía del negocio (URL
  firmada o policy de select con `is_business_member`), para que un negocio no acceda a comprobantes de
  otro. Se documenta como bucket **privado**.
- **Doble fuente de "proveedor"** → hoy "pago a proveedor" es sólo un string en caja; este módulo es la
  fuente real. Se evita acoplarlos en este cambio (queda como mejora futura referenciar `supplier_id`).
- **Vínculo proveedor↔insumo incompleto** → un insumo puede tener varios proveedores y un proveedor varios
  insumos; se modela N:N (`supplier_ingredients`) para no forzar 1:1. El cruce con `ingredient_consumptions`
  es **estimativo** (igual que la merma del cambio 10).
- **Import masivo** → upsert idempotente por `(business_id, name)`/`cuit`, filas con error reportadas sin
  abortar el lote (mismo patrón que el import de insumos del cambio 10).
- **Centavos** → `total_cents` entero; formateo con `src/lib/currency.ts`. Nunca floats.
- **Multi-tenant** → todo por `business_id` + RLS; House y Golf tienen sus proveedores separados.

## Preguntas abiertas

- [ ] Clave de unicidad del proveedor: ¿`(business_id, name)` o `(business_id, cuit)`? Propuesta: `name`
      (no todos los proveedores chicos tienen CUIT cargado), con `cuit` opcional.
- [ ] ¿El bucket `supplier-invoices` debe ser **privado** (URL firmada) o público como `products`?
      Propuesta: **privado** (la factura puede tener datos sensibles).
- [ ] ¿La estadística de proveedores incluye **total gastado por período** desde `supplier_invoices`,
      o sólo conteo de facturas? Propuesta: total en centavos + conteo + último comprobante.
- [ ] El Excel de MaxiRest de proveedores: ¿qué columnas trae (razón social, CUIT, contacto)? Se necesita
      una muestra para fijar el mapeo del importador.
- [ ] La relación proveedor↔salida de productos: ¿se cruza vía **insumo** (proveedor → insumo →
      `ingredient_consumptions`) o también vía **producto vendido**? Propuesta: vía insumo (es lo que el
      proveedor efectivamente entrega); el reporte final lo arma el cambio 16.
