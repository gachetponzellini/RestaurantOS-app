# Spec — 10-stock-y-costeo Stock extendido al bar, costo por producto, merma e import

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.
> Reglas transversales: dinero en **centavos**, **timezone AR**, scope **`business_id` + RLS**,
> mutaciones en Server Actions (`actions.ts`) validadas con Zod.

## ADDED Requirements

### Requisito: Marcar productos como stock de bar

El sistema DEBE permitir marcar un `product` como **producto de stock de bar** (`is_bar_stock`) y
listar/filtrar el stock de bar por separado del resto, scopeado por `business_id` y bajo RLS.

#### Escenario: Marcar un alfajor como stock de bar

- **Dado** un usuario con rol `admin` o `encargado` en el negocio "House"
- **Y** un producto "Alfajor de maicena" con `track_stock = false`
- **Cuando** lo marca como stock de bar
- **Entonces** el producto queda con `is_bar_stock = true` y `track_stock = true`
- **Y** aparece en la vista "Stock de bar" del panel, separado del stock de bebidas
- **Y** se crea (o reutiliza) su `stock_item` con `current_qty` inicial 0 para el `business_id` correcto.

#### Escenario: El stock de bar de un negocio no se ve en otro negocio

- **Dado** "Alfajor de maicena" marcado como stock de bar en "House"
- **Cuando** un usuario de "Golf" abre la vista "Stock de bar"
- **Entonces** no ve el alfajor de "House" (RLS por `business_id`).

#### Escenario: Sólo admin/encargado puede marcar stock de bar

- **Dado** un usuario con rol `mozo`
- **Cuando** intenta marcar un producto como stock de bar
- **Entonces** la action responde error "Solo admin o encargado pueden gestionar stock." y no modifica datos.

### Requisito: Agregar y quitar productos del stock de bar de forma flexible

El sistema DEBE permitir **agregar** un producto puntual al stock de bar y **quitarlo** sin precargar
listas enormes, conservando el histórico de movimientos al quitar.

#### Escenario: Quitar un producto de temporada sin perder histórico

- **Dado** "Helado de palito" en el stock de bar con movimientos de ingreso/venta registrados
- **Cuando** un `encargado` lo quita del stock de bar
- **Entonces** el producto queda con `track_stock = false` y deja de listarse en "Stock de bar"
- **Y** sus filas en `stock_movimientos` se conservan (baja lógica, no borrado)
- **Y** puede volver a agregarse más adelante reactivando su `track_stock`.

#### Escenario: Agregar un producto nuevo a mitad de temporada

- **Dado** un producto "Turrón" recién creado sin stock trackeado
- **Cuando** un `encargado` lo agrega al stock de bar e ingresa 24 unidades
- **Entonces** queda con `is_bar_stock = true`, `track_stock = true` y `current_qty = 24`
- **Y** se registra un `stock_movimiento` `kind='ingreso'` con `qty = 24` y `created_by` del usuario.

### Requisito: Exponer el costo y margen por producto

El sistema DEBE exponer, por producto con receta, su **costo de mercadería** (`foodCostCents`) y
**margen** (`marginPercent`/`marginCents`) en centavos, reutilizando el cálculo de costeo existente, sin
recalcular en el cliente.

#### Escenario: Ver el costo de una milanesa napolitana

- **Dado** el producto "Milanesa napolitana" con receta (milanesa + queso + salsa + …) e ingredientes con
  presentación default y `waste_percent` cargados
- **Cuando** un `encargado` abre la pantalla de stock/costeo
- **Entonces** ve el costo del producto en pesos formateado desde `foodCostCents` (centavos)
- **Y** ve el margen `marginPercent` calculado como `(price_cents − foodCostCents) / price_cents × 100`.

#### Escenario: Producto sin receta no rompe el reporte

- **Dado** un producto "Coca-Cola lata" sin receta
- **Cuando** se calcula el costeo
- **Entonces** el producto aparece con `hasRecipe = false` y costo 0, sin abortar el cálculo del resto.

### Requisito: Reporte de merma estimativa por período

El sistema DEBE ofrecer un reporte de **merma estimativa** por insumo y rango de fechas (timezone AR),
calculado a partir de `ingredient_consumptions` (entradas vs. salidas) y `waste_percent`, presentado como
aproximado.

#### Escenario: Merma del entrecote en el mes

- **Dado** el insumo "Entrecote" con `waste_percent = 12`
- **Y** consumos del mes en `ingredient_consumptions`: compras (`kind='compra'`) por 50 kg y salidas
  (`kind='venta'` + `kind='merma'`) por 44 kg
- **Cuando** un `encargado` abre el reporte de merma para ese rango de fechas
- **Entonces** ve "entró 50 kg / salió 44 kg / merma estimada según `waste_percent`" y la diferencia
- **Y** el reporte está rotulado como estimativo (no inventario contable).

#### Escenario: Filtrar el reporte por período

- **Dado** consumos repartidos en varios meses
- **Cuando** el usuario elige un rango de fechas (desde/hasta) en timezone AR
- **Entonces** el reporte agrega sólo los `ingredient_consumptions` cuyo `created_at` cae dentro del rango.

### Requisito: Importar insumos masivamente desde Excel de MaxiRest

El sistema DEBE permitir cargar un **lote de insumos** (parseados desde el Excel/CSV de MaxiRest) vía una
Server Action validada con Zod, haciendo upsert por `(business_id, name)` y reportando filas OK y filas
con error sin abortar el lote completo.

#### Escenario: Importar 80 insumos de una vez

- **Dado** un `admin` con un archivo convertido a filas (nombre, unidad, presentación, costo en centavos,
  waste, stock inicial)
- **Cuando** envía el lote por el importador
- **Entonces** la action valida cada fila con Zod, hace upsert de los insumos en el `business_id` actual
- **Y** devuelve un resumen "78 importados, 2 con error" con el detalle de las filas inválidas.

#### Escenario: Fila inválida no frena el resto

- **Dado** un lote donde una fila tiene unidad fuera de `('kg','lt','un','g','ml')`
- **Cuando** se procesa el import
- **Entonces** esa fila se reporta como error con su motivo
- **Y** las filas válidas se importan igual (el lote no se aborta).

#### Escenario: Reimportar no duplica insumos

- **Dado** un insumo "Harina 000" ya cargado en "House"
- **Cuando** se vuelve a importar un lote que incluye "Harina 000"
- **Entonces** se actualiza el insumo existente (upsert por `(business_id, name)`), no se crea un duplicado.

## MODIFIED Requirements

### Requisito: Vista de stock segmentada (bebidas, cocina y bar)

La pantalla de stock, que hoy muestra **stock de bebidas/contables** (`stock-tab.tsx`/`stock-grid.tsx`)
y **stock de cocina** (`stock-cocina-tab.tsx`), pasa a incluir una **segmentación de bar** y una columna
de **costo por producto** donde aplique, manteniendo intactos el descuento automático por venta
(`fn_stock_descuento_on_order_item`) y por receta (`fn_recipe_stock_descuento`).

#### Escenario: Convivencia de las tres vistas

- **Dado** un negocio con bebidas trackeadas, insumos de cocina y productos de bar
- **Cuando** el `encargado` navega la pantalla de stock
- **Entonces** puede ver y operar las tres segmentaciones (bebidas, cocina, bar) sin que el descuento
  automático de stock por venta cambie su comportamiento actual.
