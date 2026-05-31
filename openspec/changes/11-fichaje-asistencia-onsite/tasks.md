# Tareas — 11-fichaje-asistencia-onsite Fichaje sólo desde las PCs del local + sin propinas

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.
> Scope `business_id` + RLS; timezone AR; mutaciones en Server Actions validadas con Zod.
> La última migración real es `0051`; usar placeholder `00NN_*` (número definitivo al implementar).

## 1. Datos

- [ ] Migración `supabase/migrations/00NN_fichaje_origen_allowlist.sql`:
  - [ ] Allowlist por negocio (recomendado: tabla `clock_allowed_origins (id, business_id, cidr, label,
        created_by, created_at)`; alternativa simple: `businesses.clock_allowed_cidrs text[]`).
  - [ ] (Opcional) registro de intentos bloqueados (`clock_blocked_attempts` o columna/log) con IP y PIN
        enmascarado.
  - [ ] RLS `members_select` / `admin`-edit + `platform_*`, scope `business_id`.
- [ ] `pnpm db:types` → `src/lib/supabase/database.types.ts`.

## 2. Dominio (TDD)

### 2a. Evaluación de origen (lógica pura)
- [ ] Test (rojo): `src/lib/rrhh/<ip-allowlist>.test.ts` — IP dentro/fuera de CIDR, IPv4, lista vacía
      (default: bloquear), `x-forwarded-for` con múltiples hops.
- [ ] Implementar lógica pura `src/lib/rrhh/<ip-allowlist>.ts` (IP ∈ CIDR, sin dependencias de red).

### 2b. clockPunch con enforcement
- [ ] Test (rojo): extender cobertura de `clockPunch` — origen autorizado registra; origen no autorizado
      **no** crea `clock_entries` y no filtra existencia de PIN.
- [ ] Implementar en `src/lib/rrhh/clock-actions.ts`: leer la allowlist del `business_id`, evaluar el
      origen (IP de la request / `x-forwarded-for`), rechazar si no autorizado, registrar intento bloqueado.
- [ ] Pasar el origen desde `src/app/[business_slug]/fichar/page.tsx` (headers de la request).

### 2c. Configuración de allowlist
- [ ] Test (rojo): action de alta/baja de CIDR sólo para `admin`; scope `business_id`.
- [ ] Server Action (Zod valida formato CIDR) para gestionar la allowlist; check de permiso
      (`admin`; opcional helper `canManageFichajeOrigen` en `src/lib/permissions/can.ts`).

## 3. UI

- [ ] `src/components/fichar/clock-screen.tsx`: mensaje "El fichaje sólo está habilitado desde las
      computadoras del local" cuando el origen no está autorizado.
- [ ] Confirmar que `clock-screen.tsx` / `present-list.tsx` y la asistencia del mozo **no** muestran
      propinas (no consultar `tip_cents`).
- [ ] Form de allowlist de orígenes por negocio en `src/components/admin/settings/` (o
      `src/components/admin/rrhh/`), visible sólo para `admin`.

## 4. Verify

- [ ] `pnpm typecheck` y `pnpm test` en verde.
- [ ] Revisión fresca de archivos tocados.
- [ ] Confirmar con el cambio 14 (deploy on-site) que el proxy propaga la IP real (`x-forwarded-for`).
- [ ] Marcar ✅ en `openspec/changes/README.md`.
