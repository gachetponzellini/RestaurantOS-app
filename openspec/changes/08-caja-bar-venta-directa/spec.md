# Spec — 08-caja-bar-venta-directa Caja de bar: venta directa + no manda a comanda

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.
> Dinero en **centavos**; scope **business_id + RLS**.

## ADDED Requirements

### Requisito: Vender directo desde una mesa de bar sin asignar mozo

El sistema DEBE permitir abrir una **mesa de bar** (`tables.is_bar = true`), cargarle productos y
cobrar en el acto, **sin requerir** asignación de mozo. Reusa el flujo existente de orden `dine_in`
(`enviarComanda`) y de cobro (`registrarPago`), con scope `business_id`. La mesa de bar se abre y
se cierra rápido (vuelve a `libre` tras el cobro) y no participa del motor de reservas.

#### Escenario: venta directa de alfajor + coca

- **Dado** una mesa de bar "Bar" (`is_bar = true`) en estado `libre`
- **Cuando** el operador carga "alfajor" + "coca" y registra el cobro en la caja del bar
- **Entonces** se crea/usa una `order` `dine_in` de esa mesa, se registran los `payments` contra la
  caja indicada y la venta queda asentada
- **Y** no fue necesario asignar un mozo a la mesa para vender

#### Escenario: la mesa de bar no exige mozo pero sí caja válida

- **Dado** una mesa de bar y un intento de cobro con una `caja_id` de **otro** negocio
- **Cuando** se registra el pago
- **Entonces** la acción falla por scope (`business_id`) de la caja (igual que en el salón)
- **Y** con una caja válida y activa del negocio, el cobro se registra sin requerir mozo

### Requisito: La barra no manda a comanda, salvo los sectores que expiden

El sistema DEBE, al enviar items desde una **mesa de bar**, **no** generar comandas, **excepto**
para items cuyo `station` esté marcado como **expide a comanda** (`stations.routes_to_comanda =
true`, p. ej. sanguchería/tostados/tocaditos). La decisión vive en una función pura testeable
`src/lib/comandas/bar-routing.ts`. En una **mesa normal** (no bar) el ruteo a comandas no cambia
respecto de hoy.

#### Escenario: bebida y kiosco en la barra no imprimen comanda; el sándwich sí

- **Dado** una mesa de bar y los sectores: "Kiosco/Bebidas" con `routes_to_comanda = false` y
  "Sanguchería" con `routes_to_comanda = true`
- **Cuando** se envían "coca" (kiosco) y "tostado" (sanguchería)
- **Entonces** **no** se crea comanda para la coca
- **Y** **sí** se crea una comanda para el tostado, ruteada a "Sanguchería"

#### Escenario: la misma carga en una mesa normal sí rutea como hoy

- **Dado** una mesa **normal** (no bar) con un ítem cuyo sector resuelto es "Cocina"
- **Cuando** se envían los items
- **Entonces** se crea la comanda de "Cocina" con su `batch`, idéntico al comportamiento actual
  (no se aplica la excepción de bar)

### Requisito: Marcar un sector como expide-a-comanda

El sistema DEBE permitir al admin marcar/desmarcar una `station` como **expide a comanda**
(`routes_to_comanda`), para que cada negocio (House/Golf) configure qué sectores de su barra salen a
comanda (sanguchería sí; bebidas/kiosco no). La acción valida con Zod y scope `business_id`.

#### Escenario: configurar sanguchería como sector que expide

- **Dado** un admin autenticado y el sector "Sanguchería" del negocio
- **Cuando** lo marca como expide-a-comanda
- **Entonces** `stations.routes_to_comanda` queda en `true` para ese sector
- **Y** a partir de ahí los tostados/tocaditos vendidos en la barra generan comanda a ese sector

## MODIFIED Requirements

### Requisito: enviarComanda respeta la excepción de la barra

Hoy `enviarComanda` (`src/lib/comandas/actions.ts`) agrupa todos los items con `station_id`
resoluble en `itemsByStation` y `createComandasForItems` crea una comanda por sector (los items con
`station_id = null` o `track_stock` ya se excluyen). Pasa a ser distinto: cuando la orden pertenece
a una **mesa de bar**, se excluyen del `itemsByStation` también los items cuyo sector **no** expide
a comanda (`routes_to_comanda = false`), de modo que la barra no imprima comandas salvo
sanguchería/tostados/tocaditos. El resto del flujo (order_items, precios, snapshots de modifiers,
descuento de stock) no cambia.

#### Escenario: items de bar sin expedición se guardan pero no generan comanda

- **Dado** una mesa de bar y una coca (sector que no expide)
- **Cuando** se envía
- **Entonces** se inserta el `order_item` (con su precio y, si corresponde, su descuento de stock)
- **Y** **no** se crea comanda para ese item (queda fuera de `itemsByStation` por ser bar +
  sector que no expide)
