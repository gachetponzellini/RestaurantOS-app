# Tareas — 07-caja-rendicion-mozos Rendición de mozos + asignación de cajas

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.
> Dinero en centavos · timezone AR · scope business_id + RLS.

## 1. Datos
- [ ] Migración `supabase/migrations/00NN_rendicion_mozos.sql`:
  - [ ] Tabla `mozo_rendiciones` (`id`, `business_id`, `mozo_id`, `registered_by`,
        `expected_cash_cents bigint`, `delivered_cash_cents bigint`, `difference_cents bigint`,
        `notes text`, `por_metodo jsonb`, `created_at`) — patrón espejo de `caja_cortes` (0044).
  - [ ] Tabla puente `caja_user_assignments` (`id`, `business_id`, `caja_id` → `cajas`,
        `user_id` → `users`, `created_at`, `unique (business_id, caja_id, user_id)`).
  - [ ] Índices: `mozo_rendiciones (business_id, mozo_id, created_at desc)`,
        `caja_user_assignments (business_id, caja_id)`.
  - [ ] RLS en ambas: `members_select/insert` (`is_business_member(business_id)`),
        `members_update` en `mozo_rendiciones`, y policies de platform admin (patrón 0044/0048).
- [ ] `pnpm db:types` → `src/lib/supabase/database.types.ts`.

## 2. Dominio (TDD)
- [ ] Test (rojo): `src/lib/caja/liquidacion-mozo.test.ts` cubriendo: efectivo a entregar = suma
      `cash` sin propina; tarjeta/transferencia informados; mozo sin pagos → todo en cero.
- [ ] Implementar pura `src/lib/caja/liquidacion-mozo.ts`:
      `calcularRendicionMozo(payments) → { efectivo_cents, por_metodo, tickets_cents }`
      (excluye `tip_cents`; sólo `method='cash'` cuenta como efectivo).
- [ ] Tipos en `src/lib/caja/types.ts`: `MozoRendicion`, `RendicionMozoPendiente`,
      `CajaUserAssignment`.
- [ ] Permisos en `src/lib/permissions/can.ts`: `canRendirMozo` (admin/encargado); reusar
      `canManageCajas` (admin) para asignaciones. Extender `can.test.ts`.
- [ ] Query en `src/lib/caja/queries.ts`: `getRendicionPendienteMozo(mozoId, businessId)` (pagos
      con `attributed_mozo_id` + `payment_status='paid'` desde la última rendición, patrón
      `gt('created_at', ultima)` como `getCajaLiveStats`); `getCajaUserAssignments(businessId)`.
- [ ] Server Actions en `src/lib/caja/actions.ts` (Zod + `requireMozoActionContext` + `can.ts`):
  - [ ] `registrarRendicionMozo(mozoId, delivered_cash_cents, notes, slug)` — exige nota si
        diferencia ≠ 0; persiste en `mozo_rendiciones`.
  - [ ] `asignarCajaUsuario(cajaId, userId, slug)` / `desasignarCajaUsuario(...)` — valida scope
        `business_id` de caja y usuario; idempotente ante duplicado.

## 3. UI
- [ ] Nueva pestaña "Rendición de mozos" en `src/components/admin/local/` (junto a
      `caja-admin-board.tsx`): lista mozos con su efectivo/tickets a rendir y botón "Registrar
      rendición"; formatea con `src/lib/currency.ts` y hora AR con `date-fns-tz`.
- [ ] UI de asignación caja↔usuario (selector por caja) para el admin.

## 4. Verify
- [ ] `pnpm typecheck` y `pnpm test` en verde.
- [ ] Revisión fresca de archivos tocados (no se mezcla rendición con `hacerCorte`).
- [ ] Marcar ✅ en `openspec/changes/README.md`.
