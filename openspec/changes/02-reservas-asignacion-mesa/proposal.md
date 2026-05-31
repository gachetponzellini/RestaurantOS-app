# 02-reservas-asignacion-mesa — Asignar mesa a una reserva desde gestión

> Estado: 📋 propuesto · Origen: Reunión §4 (Reservas), §7.3, §7.14, §6 · Design: no

## Por qué

En la demo, cuando entra una reserva (sobre todo las que vienen por web o por el chatbot), el
encargado quiere **elegir/cambiar la mesa desde la gestión de reservas**, leyendo la nota del
cliente, antes de sentarlos. Hoy el sistema asigna mesa **automáticamente** (smallest-fit,
`pickTable`) y el operador sólo puede **fijar mesa al crear** una reserva nueva desde el admin
(`forcedTableId` en `createReservationFromAdmin`). No hay forma de **reasignar la mesa de una
reserva ya confirmada** que llegó por la web: si la auto-asignación no es la deseada (p. ej. el
cliente pidió "mesa junto a la ventana" en la nota), el encargado no tiene cómo cambiarla salvo
sentarla en otra mesa manualmente, perdiendo la trazabilidad (§7.3, §7.14).

La reunión también pidió **elegir la mesa sobre el plano** del salón; eso queda como futuro
(ver §6 y "No incluye"). Este cambio resuelve lo mínimo y de mayor valor: **un selector de mesa
por reserva** en la lista de gestión, respetando la regla de no superposición que ya garantiza la
base (constraint de exclusión `23P01`).

## Qué cambia

- Nueva **Server Action `updateReservationTable`** en
  `src/lib/reservations/booking-actions.ts` que reasigna la `table_id` de una reserva
  **confirmada** del negocio, validando: la mesa existe, está `active`, pertenece al negocio
  (cross-tenant), tiene capacidad ≥ `party_size`, y **no se superpone** con otra reserva viva en
  la ventana de la reserva (buffer incluido). Si la base rechaza por exclusión (`23P01`), se
  devuelve un error claro ("La mesa ya está reservada en ese horario.").
- La **lista de gestión** (`src/components/reservations/admin-day-list.tsx`) suma, en cada fila
  de reserva **confirmada**, un control para **cambiar la mesa** (elige entre `activeTables`, que
  ya llegan como prop), mostrando el salón cuando hay multi-salón.
- Se reutiliza la lógica pura de no-solape de `src/lib/reservations/assign-table.ts`
  (`pickTable`/overlap) para el pre-chequeo en cliente/acción; la **fuente de verdad** sigue
  siendo el constraint de la base.

## Alcance

**Incluye:**
- Server Action `updateReservationTable` + `UpdateReservationTableInputSchema` (Zod) en
  `src/lib/reservations/schema.ts`.
- Validación de capacidad, tenencia (`business_id`) y **no-solape** reutilizando el chequeo de
  `assign-table.ts` y `getReservationsInRange`/`getBusinessTables` de
  `src/lib/reservations/queries.ts`.
- UI de "cambiar mesa" por reserva confirmada en `admin-day-list.tsx` (selector sobre las
  `activeTables`/`floorPlans` que la página ya carga).
- Permisos: sólo **admin/encargado/plataforma** (mismo `assertCanManage` que el resto de las
  acciones de reservas; el mozo no reasigna).

**No incluye (fuera de alcance):**
- **Elegir la mesa sobre el plano** (mapa-pick en los dos salones): queda como futuro (§6).
  Acá la selección es por **lista/selector**, leyendo la nota del cliente.
- Cambiar mesa de reservas que **no** están `confirmed` (una vez `seated` la mesa ya se abrió vía
  `sentarReserva`/`openTable`; eso es operación de mesas, no reserva).
- Cambiar horario, salón como entidad, comensales u otros datos de la reserva.
- Notificar al cliente el cambio de mesa (no hay requerimiento de mensaje en la reunión).

## Impacto

- **Archivos** (reales):
  - `src/lib/reservations/booking-actions.ts` (nueva action `updateReservationTable`).
  - `src/lib/reservations/schema.ts` (nuevo `UpdateReservationTableInputSchema`).
  - `src/lib/reservations/assign-table.ts` + `assign-table.test.ts` (reutilizar/extender el
    chequeo de solape para una mesa puntual).
  - `src/lib/reservations/queries.ts` (lecturas ya existentes: `getBusinessTables`,
    `getReservationsInRange`).
  - `src/components/reservations/admin-day-list.tsx` (UI de cambio de mesa por fila).
  - `src/app/[business_slug]/admin/(authed)/reservas/page.tsx` (ya provee `floorPlans` y
    `activeTables`; sin cambios de carga salvo que se necesite pasar algún dato extra).
- **Datos:** **sin migración**. `reservations.table_id` y la constraint de exclusión
  (no-solape por mesa/horario) ya existen; sólo se hace `update` de `table_id`. RLS heredado
  (scope `business_id`); las escrituras van por **service client** dentro de la Server Action,
  como el resto de `booking-actions.ts`.
- **Tipos:** n/a (no cambia el schema de datos; no hace falta `pnpm db:types`).
- **Permisos:** sin cambios en `src/lib/permissions/can.ts`; se usa `assertCanManage`
  (plataforma/admin/encargado) ya presente en `booking-actions.ts`.
- **Integraciones:** n/a.

## Riesgos

- **Carrera/solape al reasignar** → dos operadores ponen la misma mesa en horarios que chocan.
  Mitigación: pre-chequeo con la lógica de `assign-table.ts` **+** confiar en el constraint de
  exclusión de la base como fuente de verdad; mapear `23P01` a un mensaje claro y no romper.
- **Reasignar una reserva ya sentada** rompería la coherencia con la mesa abierta. Mitigación:
  la action sólo permite reasignar reservas en estado `confirmed` (rechaza `seated`/cerradas).
- **Mesa de otro negocio o deshabilitada** → fuga cross-tenant o asignación inválida.
  Mitigación: validar tenencia (`business_id` vía join a `floor_plans`) y `status = 'active'`
  y capacidad ≥ `party_size`, igual que en la rama `forcedTableId` de creación.

## Preguntas abiertas

- [ ] ¿Se permite **quitar** la mesa (dejar la reserva sin mesa asignada) o sólo **cambiarla**
      por otra válida? Hoy `sentarReserva` exige `table_id`; lo más seguro es exigir siempre una
      mesa válida.
- [ ] Al cambiar de mesa, ¿debe poder cruzar de **salón** (otro `floor_plan`) o se restringe al
      salón actual de la reserva? (afecta el filtro del selector cuando hay multi-salón).
- [ ] ¿Hace falta registrar **auditoría** de quién cambió la mesa y cuándo, o alcanza con el
      estado actual de la reserva?
