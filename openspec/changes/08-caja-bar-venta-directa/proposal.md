# 08-caja-bar-venta-directa — Caja de bar: venta directa sin mozo + no manda a comanda

> Estado: 📋 propuesto · Origen: Reunión §4 (Panel / Caja) · §7.13 · §6 · Design: no

## Por qué

La barra necesita **vender productos directo** (ej. alguien compra un alfajor + una coca) **sin
mozo ni mesa real** y cobrar en el acto. Hoy todo cobro de salón nace de una `order` `dine_in`
asociada a una `table` (`enviarComanda` en `src/lib/comandas/actions.ts`, migración
`0023_dine_in_and_kitchen.sql`). En la reunión (§4 · Panel y §7.13) se decidió modelar esto con una
**"mesa" llamada "bar"** que se abre/cierra rápido, para reutilizar el flujo de orden→cobro→caja sin
inventar un camino paralelo.

Regla dura de negocio (§6 y §7.13): **la barra NO manda a comanda**, **salvo**
sanguchería/tostados/tocaditos, que sí salen a su sector. Hoy el ruteo a sector lo decide
`resolveStation` (`src/lib/comandas/routing.ts`) y la creación de comandas
`createComandasForItems` (`src/lib/comandas/route-items.ts`): hay que introducir la **excepción**
para que una venta de bar no imprima comanda, excepto los productos de esos sectores.

## Qué cambia

- **Mesa "bar" como venta directa**: una `table` marcada como mesa de barra (flag nuevo
  `is_bar`/`kind='bar'`) que abre/cierra rápido y permite cargar productos y cobrar sin asignación de
  mozo. Reusa `orders` `dine_in` + `tables.operational_status` (`libre`/`ocupada`) + el flujo de
  cobro existente (`src/lib/billing/cobro-actions.ts`).
- **La barra no manda a comanda (con excepción)**: al enviar items desde una mesa de bar, **no** se
  crean comandas, **excepto** los items cuyo sector resuelto sea de **expedición a comanda** (p. ej.
  sanguchería/tostados/tocaditos). Se introduce una marca por `station` (`routes_to_comanda` /
  `expide`) y `enviarComanda` filtra el `itemsByStation` según mesa-de-bar + esa marca.
- **Lógica pura nueva** `bar-routing.ts`: dado (`tableIsBar`, `stationExpide`), decide si un item
  genera comanda. Mantiene `route-items.ts` y `routing.ts` intactos como hoy para el salón normal.

## Alcance

**Incluye:**
- Marca de **mesa de bar** sobre `tables` (migración) y de **sector que expide a comanda** sobre
  `stations`.
- Lógica pura `src/lib/comandas/bar-routing.ts` (+ test) para la regla "bar no manda a comanda salvo
  sectores que expiden".
- Ajuste en `src/lib/comandas/actions.ts` (`enviarComanda`) para aplicar esa regla al construir
  `itemsByStation` (no romper el flujo de salón normal).
- Acciones para abrir/cerrar rápido la mesa de bar y para marcar una `station` como
  expide-a-comanda, donde corresponda (catálogo de stations: `src/lib/catalog/station-actions.ts`).
- UI mínima de "Caja de bar / venta directa" en `src/components/admin/local/` consumiendo el flujo.

**No incluye (fuera de alcance):**
- Stock del bar (alfajores, etc.): vive en el cambio **10 (stock-y-costeo)**.
- Propina y métodos de cobro: ya están en el cambio **06 (cobro-y-propina)**; acá sólo se reusa.
- Rendición de mozos: la venta de bar no tiene mozo atribuido (cambio **07**).
- Crear un **modelo de venta sin `order`** (ticket suelto): se descarta a favor de reusar `orders`
  `dine_in` con la mesa "bar".

## Impacto

- **Archivos** (reales): `src/lib/comandas/actions.ts` (`enviarComanda`),
  `src/lib/comandas/routing.ts` / `route-items.ts` (sin romper; la excepción entra en
  `bar-routing.ts` nuevo y en el filtro de `actions.ts`), `src/lib/comandas/bar-routing.ts` (nuevo),
  `src/lib/catalog/station-actions.ts`, `src/components/admin/local/` (UI venta directa de bar).
- **Datos:** nueva migración `supabase/migrations/00NN_caja_bar.sql`:
  `tables.is_bar boolean not null default false` (mesa de barra) y
  `stations.routes_to_comanda boolean not null default true` (sectores como sanguchería marcados
  para expedir; bebidas/kiosco no). RLS existente de `tables`/`stations` cubre el scope
  (`business_id` vía `floor_plans` / directa). Sin tablas nuevas.
- **Tipos:** regenerar `pnpm db:types` → `src/lib/supabase/database.types.ts`.
- **Permisos:** n/a nuevos (abrir/cargar/cobrar en barra usa los mismos checks de salón; anular sigue
  siendo mostrador — `canCancelItem`/`canTransitionMesa` en `src/lib/permissions/can.ts`).
- **Integraciones:** n/a.

## Riesgos

- **No romper el ruteo del salón** → `resolveStation` y `createComandasForItems` quedan idénticos;
  la excepción se aplica **sólo** cuando la mesa es de bar. Cobertura: el test de `routing.ts`
  existente debe seguir verde y se agrega `bar-routing.test.ts`.
- **Sanguchería/tostados/tocaditos** son **datos** (un `station` por negocio), no nombres hardcodeados
  → la marca `routes_to_comanda` evita acoplar la lógica a strings. House/Golf configuran sus
  sectores.
- **Mesa "bar" mezclada con el plano** → `is_bar` permite tratarla aparte (no requiere posición en el
  plano ni cuenta para disponibilidad de reservas); se documenta que las mesas de bar se excluyen del
  motor de reservas (`tables.status` ya separa `active/disabled`; `is_bar` es ortogonal).
- **Dinero/centavos** → el cobro reusa `registrarPago` (centavos), sin cambios.

## Preguntas abiertas

- [ ] ¿Una sola mesa "bar" por negocio o varias (una por barra física)? Asumimos N (flag por mesa),
      cada barra puede tener su mesa de bar.
- [ ] ¿La venta de bar **atribuye mozo** para alguna métrica? Asumimos que **no** (sin mozo); queda
      fuera de la rendición de mozos (cambio 07).
- [ ] ¿La barra debería poder cobrar **antes** de "enviar" (cobro directo, sin paso de comanda)?
      Asumimos: cargar → cobrar en el mismo gesto, sólo se imprime comanda para sectores que expiden.
