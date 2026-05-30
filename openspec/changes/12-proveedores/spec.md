# Spec — 12-proveedores Módulo nuevo de Proveedores

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.
> Reglas transversales: dinero en **centavos**, **timezone AR**, scope **`business_id` + RLS**,
> mutaciones en Server Actions (`src/lib/proveedores/actions.ts`) validadas con Zod.
> Es un **módulo nuevo** (no existe `src/lib/proveedores` hoy): todos los requisitos son ADDED.

## ADDED Requirements

### Requisito: Gestionar proveedores por negocio

El sistema DEBE permitir crear, editar y desactivar proveedores (nombre, CUIT opcional, contacto, notas)
scopeados por `business_id` y protegidos por RLS, gestionables por `admin`/`encargado`.

#### Escenario: Crear un proveedor

- **Dado** un usuario con rol `admin` o `encargado` en "House"
- **Cuando** crea el proveedor "Distribuidora del Sur" con CUIT y teléfono
- **Entonces** se guarda un `supplier` con ese `business_id`, `is_active = true` y unicidad por
  `(business_id, name)`.

#### Escenario: Un negocio no ve los proveedores de otro

- **Dado** "Distribuidora del Sur" creada en "House"
- **Cuando** un usuario de "Golf" lista proveedores
- **Entonces** no aparece el proveedor de "House" (RLS por `business_id`).

#### Escenario: El mozo no gestiona proveedores

- **Dado** un usuario con rol `mozo`
- **Cuando** intenta crear o editar un proveedor
- **Entonces** la action responde error de permiso y no modifica datos.

### Requisito: Cargar la factura del proveedor con su foto

El sistema DEBE permitir cargar una **factura de compra** de un proveedor con sus datos básicos
(número, fecha, **total en centavos**) y la **foto del comprobante** subida al bucket `supplier-invoices`
(path `<business_id>/<uuid>.<ext>`), guardando la URL en la factura. NO emite comprobante fiscal (sin CAE).

#### Escenario: Subir foto y cargar el comprobante

- **Dado** un `encargado` con la foto de una factura de "Distribuidora del Sur"
- **Cuando** sube la imagen y carga número, fecha y total $45.000
- **Entonces** la imagen queda en el bucket `supplier-invoices` bajo el prefijo del `business_id`
- **Y** se crea un `supplier_invoice` con `total_cents = 4500000`, `photo_url` apuntando a la imagen y
  `created_by` del usuario.

#### Escenario: La factura de compra no genera CAE ni toca ARCA

- **Dado** la carga de una factura de proveedor
- **Cuando** se guarda
- **Entonces** no se invoca ningún flujo de facturación de venta (`src/lib/afip`) ni se genera CAE: es un
  registro de compra interno.

#### Escenario: La foto de un negocio no es accesible por otro

- **Dado** una foto de factura cargada por "House"
- **Cuando** un usuario de "Golf" intenta acceder a esa imagen
- **Entonces** el acceso se deniega (bucket privado con policy `is_business_member` por `business_id`).

### Requisito: Estadística de proveedores por período

El sistema DEBE ofrecer una estadística por proveedor (cantidad de facturas, **total gastado en
centavos**, último comprobante) filtrable por rango de fechas en timezone AR.

#### Escenario: Total gastado por proveedor en el mes

- **Dado** "Distribuidora del Sur" con 3 facturas en el mes por $45.000, $30.000 y $25.000
- **Cuando** un `encargado` abre la estadística de proveedores para ese rango
- **Entonces** ve 3 facturas, total $100.000 (sumado en centavos) y la fecha del último comprobante.

#### Escenario: Filtrar por período

- **Dado** facturas repartidas en varios meses
- **Cuando** el usuario elige un rango desde/hasta (timezone AR)
- **Entonces** la estadística agrega sólo los `supplier_invoices` cuyo `invoice_date` cae en el rango.

### Requisito: Relacionar proveedor con salida de productos

El sistema DEBE permitir vincular un proveedor con los **insumos** (`ingredients`) que provee (relación
N:N), de modo que la analítica pueda cruzar lo comprado a ese proveedor con la **salida de esos insumos**
(`ingredient_consumptions`). Acá se modela el vínculo y la query base; el reporte cruzado se consume en el
cambio 16.

#### Escenario: Vincular un proveedor a los insumos que entrega

- **Dado** "Distribuidora del Sur" y los insumos "Entrecote" y "Vacío"
- **Cuando** un `encargado` los asocia al proveedor
- **Entonces** se crean filas en `supplier_ingredients` que vinculan el proveedor con cada insumo, scopeadas
  por `business_id`.

#### Escenario: Query base proveedor → salida de productos

- **Dado** "Entrecote" vinculado a "Distribuidora del Sur" con consumos (`kind='venta'`) registrados en el
  período
- **Cuando** se consulta la relación proveedor↔salida para ese rango
- **Entonces** la query devuelve, por proveedor, la salida agregada de sus insumos vinculados (estimativo),
  lista para que el cambio 16 arme el reporte.

### Requisito: Importar proveedores masivamente desde Excel de MaxiRest

El sistema DEBE permitir cargar un **lote de proveedores** (parseados desde el Excel/CSV de MaxiRest) vía
Server Action validada con Zod, con upsert por `(business_id, name)` y reporte de filas OK y con error sin
abortar el lote.

#### Escenario: Importar la lista de proveedores

- **Dado** un `admin` con un archivo convertido a filas (nombre, CUIT, contacto)
- **Cuando** envía el lote por el importador
- **Entonces** se validan las filas con Zod, se hace upsert de los proveedores en el `business_id` actual
- **Y** se devuelve un resumen "N importados, M con error" con el detalle de los inválidos.

#### Escenario: Reimportar no duplica proveedores

- **Dado** "Distribuidora del Sur" ya cargada en "House"
- **Cuando** se vuelve a importar un lote que la incluye
- **Entonces** se actualiza el proveedor existente (upsert por `(business_id, name)`), sin crear duplicado.
