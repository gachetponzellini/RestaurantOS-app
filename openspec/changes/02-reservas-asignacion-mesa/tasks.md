# Tareas — 02-reservas-asignacion-mesa Asignar mesa a una reserva desde gestión

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.

## 1. Datos

- [ ] Sin migración: `reservations.table_id` y el constraint de exclusión (no-solape por
      mesa/horario) ya existen. Confirmar que no hace falta policy RLS nueva (las escrituras van
      por service client dentro de la Server Action, scope `business_id` validado en código).

## 2. Dominio (TDD)

- [ ] Test (rojo): en `src/lib/reservations/assign-table.test.ts`, cubrir el chequeo de
      **no-solape para una mesa puntual** (mesa libre → ok; mesa con reserva viva que solapa con
      buffer → conflicto; reserva cancelada/no_show no cuenta).
- [ ] Implementar/extender en `src/lib/reservations/assign-table.ts` el helper de solape para una
      mesa específica (reutilizando la lógica de ventana + buffer de `pickTable`).
- [ ] Añadir `UpdateReservationTableInputSchema` (Zod) en `src/lib/reservations/schema.ts`
      (`business_slug`, `reservation_id` uuid, `table_id` uuid).
- [ ] Implementar la Server Action `updateReservationTable` en
      `src/lib/reservations/booking-actions.ts`:
      - `assertCanManage` (plataforma/admin/encargado).
      - Cargar reserva del negocio; exigir estado `confirmed`.
      - Validar mesa: existe, `active`, pertenece al negocio (join `floor_plans.business_id`),
        capacidad ≥ `party_size`.
      - Pre-chequeo de solape con `getReservationsInRange` + helper de `assign-table.ts`.
      - `update` de `table_id`; mapear `23P01` (exclusión) a mensaje claro.
      - `revalidatePath` de `/${slug}/admin/reservas`.

## 3. UI

- [ ] En `src/components/reservations/admin-day-list.tsx`, agregar a `ReservationRow` (sólo
      `status === "confirmed"`) un selector de mesa sobre `activeTables`, mostrando el salón
      cuando `multiSalon`, que invoque `updateReservationTable` y haga `router.refresh()` +
      toast.
- [ ] Verificar que la página `src/app/[business_slug]/admin/(authed)/reservas/page.tsx` ya pasa
      `floorPlans` y `activeTables` (no requiere cambios de carga).

## 4. Verify

- [ ] `pnpm typecheck` y `pnpm test` en verde.
- [ ] Revisión fresca de los archivos tocados (especialmente validación de tenencia y mapeo de
      `23P01`).
- [ ] Marcar ✅ en `openspec/changes/README.md`.
