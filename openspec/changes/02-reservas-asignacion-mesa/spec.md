# Spec — 02-reservas-asignacion-mesa Asignar mesa a una reserva desde gestión

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.

## ADDED Requirements

### Requisito: Reasignar la mesa de una reserva confirmada

El sistema DEBE ofrecer una Server Action `updateReservationTable` que cambie la `table_id` de
una reserva en estado `confirmed` del negocio actual. La action DEBE validar que la mesa elegida
existe, está `active`, pertenece al negocio (scope `business_id`) y tiene capacidad
(`seats`) mayor o igual a `party_size`. Sólo pueden ejecutarla **admin, encargado o admin de
plataforma** (mismo criterio que el resto de las acciones de reservas). El input se valida con
Zod (`UpdateReservationTableInputSchema`).

#### Escenario: Encargado cambia la mesa por una válida

- **Dado** una reserva confirmada para 4 personas con mesa A asignada
- **Y** una mesa B `active` del mismo negocio con capacidad para 6
- **Cuando** el encargado reasigna la reserva a la mesa B desde la gestión de reservas
- **Entonces** la reserva queda con `table_id` = mesa B
- **Y** la lista de reservas refleja la mesa B en esa fila

#### Escenario: Mesa sin capacidad suficiente

- **Dado** una reserva confirmada para 6 personas
- **Y** una mesa con capacidad para 2
- **Cuando** el encargado intenta reasignar la reserva a esa mesa
- **Entonces** la action devuelve un error indicando que la mesa no tiene capacidad para 6
- **Y** la reserva conserva su mesa anterior

#### Escenario: Permiso denegado para el mozo

- **Dado** un usuario con rol `mozo` del negocio
- **Cuando** intenta ejecutar `updateReservationTable`
- **Entonces** la action devuelve "Permiso denegado." y no modifica la reserva

#### Escenario: Mesa de otro negocio (cross-tenant)

- **Dado** una reserva confirmada del negocio actual
- **Y** una mesa que pertenece a otro negocio
- **Cuando** se intenta reasignar la reserva a esa mesa
- **Entonces** la action rechaza la operación (mesa no encontrada para el negocio) sin tocar la
  reserva

### Requisito: Impedir solapamiento al reasignar mesa

El sistema DEBE impedir que la reasignación deje dos reservas vivas superpuestas en la misma mesa
y franja horaria (incluido el buffer de turnover). El pre-chequeo reutiliza la lógica pura de
no-solape de `src/lib/reservations/assign-table.ts`; la **fuente de verdad** es el constraint de
exclusión de la base, cuyo error (`23P01`) DEBE mapearse a un mensaje claro sin romper la acción.

#### Escenario: Mesa ocupada por otra reserva en el mismo horario

- **Dado** una reserva confirmada que se quiere mover a la mesa C
- **Y** otra reserva viva ya ocupa la mesa C en una ventana que se superpone (con buffer)
- **Cuando** el encargado intenta reasignar la reserva a la mesa C
- **Entonces** la action devuelve "La mesa ya está reservada en ese horario." y no cambia la
  reserva

#### Escenario: Carrera resuelta por el constraint de la base

- **Dado** dos operadores que, casi a la vez, intentan mover dos reservas a la misma mesa en
  horarios que chocan
- **Cuando** la base rechaza la segunda escritura con el código de exclusión `23P01`
- **Entonces** la action traduce ese error a un mensaje legible y deja la segunda reserva sin
  cambios (no se produce doble reserva)

#### Escenario: Reasignación a la misma franja sin conflicto

- **Dado** una reserva confirmada y una mesa D libre en su ventana (sin reservas vivas que
  solapen)
- **Cuando** el encargado reasigna la reserva a la mesa D
- **Entonces** la operación se confirma y la reserva queda en la mesa D

### Requisito: Cambiar la mesa desde la lista de gestión de reservas

El sistema DEBE permitir, en la fila de cada reserva **confirmada** de la lista de gestión
(`src/components/reservations/admin-day-list.tsx`), elegir otra mesa entre las mesas activas del
negocio (`activeTables`, ya provistas por la página). Cuando el negocio tiene más de un salón, el
selector DEBE mostrar el salón de cada mesa para evitar ambigüedad.

#### Escenario: Selector visible sólo en reservas confirmadas

- **Dado** una reserva en estado `confirmed` y otra en estado `seated` en la lista del día
- **Cuando** el encargado abre la lista de gestión
- **Entonces** la reserva `confirmed` muestra el control para cambiar de mesa
- **Y** la reserva `seated` no lo muestra (ya está sentada)

#### Escenario: Multi-salón muestra el nombre del salón

- **Dado** un negocio con dos salones y una reserva confirmada
- **Cuando** el encargado abre el selector de mesa de esa reserva
- **Entonces** cada opción de mesa indica a qué salón pertenece

#### Escenario: Cambio exitoso refresca la fila

- **Dado** una reserva confirmada con mesa A
- **Cuando** el encargado elige la mesa B en el selector y la operación es válida
- **Entonces** se muestra una confirmación (toast de éxito) y la fila pasa a mostrar la mesa B
