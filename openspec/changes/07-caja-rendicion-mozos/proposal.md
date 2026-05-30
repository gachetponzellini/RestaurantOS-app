# 07-caja-rendicion-mozos — Rendición de mozos + asignación de cajas a usuarios

> Estado: 📋 propuesto · Origen: Reunión §4 (Caja) · §7.10 · §7.17 · Design: no

## Por qué

Los mozos trabajan con **billetera personal**: cobran efectivo y reciben tickets de
tarjeta/transferencia durante el turno, y al cerrar deben **rendir** lo que les corresponde
("Darío te tiene que dar tanto…"). Hoy ese conteo se hace a mano y se mezcla con el **arqueo de
caja**, ensuciando el corte (`hacerCorte` en `src/lib/caja/actions.ts`). En la reunión (§4 · Caja
y §7.10) se decidió agregar una **pestaña de "rendición de cuenta de mozo"**, *separada* de la
caja, para la conciliación de fin de turno por mozo. Además se pidió (§4 · Caja y §7.17) poder
**asignar cajas a un usuario** (qué usuario opera qué caja).

La base de datos ya tiene lo necesario para derivar la rendición: `payments.attributed_mozo_id`
+ `payments.method` + `payments.amount_cents` (`src/lib/billing/cobro-actions.ts`,
migración `0036_payments.sql`). Falta el contrato de cierre por mozo y la asociación usuario↔caja.

## Qué cambia

- **Nueva pestaña "Rendición de mozos"** (separada del board de caja), que lista por mozo lo cobrado
  desde su última rendición: efectivo, tarjeta y transferencia, derivado de `payments`
  (`attributed_mozo_id`). La propina **no** entra en lo que el mozo rinde (regla transversal).
- **Cálculo de "cuánto debe rendir"**: lógica pura nueva `liquidacion-mozo.ts` que toma los pagos
  atribuidos al mozo en el período y devuelve el efectivo a entregar y el detalle por método (los
  tickets de tarjeta/transferencia se informan pero no son efectivo físico a entregar).
- **Registrar la rendición**: nueva tabla `mozo_rendiciones` (un cierre por mozo + período), con
  monto esperado, monto entregado y diferencia, análoga conceptualmente a `caja_cortes` pero por
  mozo. Cierra el período de ese mozo.
- **Asignar cajas a un usuario**: nueva tabla `caja_user_assignments` (usuario↔caja, scope
  `business_id`) + acciones de alta/baja para que el admin defina qué usuario opera qué caja.

## Alcance

**Incluye:**
- Lógica pura `src/lib/caja/liquidacion-mozo.ts` (+ test) para el efectivo/tickets a rendir por mozo.
- Migración nueva con `mozo_rendiciones` y `caja_user_assignments` (+ RLS, scope `business_id`).
- Server Actions en `src/lib/caja/actions.ts`: `registrarRendicionMozo`, `asignarCajaUsuario`,
  `desasignarCajaUsuario` (Zod + permisos `can.ts`).
- Queries en `src/lib/caja/queries.ts`: rendición pendiente por mozo (período actual) y asignaciones.
- UI: pestaña de rendición en `src/components/admin/local/` (junto a `caja-admin-board.tsx`) y
  selector de cajas por usuario.

**No incluye (fuera de alcance):**
- Liquidación de **sueldos/horas** del mozo (eso es RRHH, migración `0045`, cambio 11).
- **Propina** dentro de lo que rinde el mozo (queda fuera por decisión §6 de la reunión).
- Forzar el cierre de caja (`hacerCorte`) a depender de las rendiciones: siguen separados.
- Distribución/reparto de propina entre mozos (no se pidió).

## Impacto

- **Archivos** (reales): `src/lib/caja/actions.ts`, `src/lib/caja/queries.ts`,
  `src/lib/caja/types.ts`, `src/lib/caja/liquidacion-mozo.ts` (nuevo),
  `src/components/admin/local/caja-admin-board.tsx` (+ nuevo componente de rendición),
  `src/lib/permissions/can.ts`.
- **Datos:** nueva migración `supabase/migrations/00NN_rendicion_mozos.sql` con `mozo_rendiciones`
  y `caja_user_assignments` + policies RLS (members select/insert/update, platform admin),
  scope `business_id`. Reusa `payments` para derivar montos.
- **Tipos:** regenerar `pnpm db:types` → `src/lib/supabase/database.types.ts`.
- **Permisos:** agregar `canRendirMozo` (encargado/admin operan la rendición) y reusar
  `canManageCajas` (admin) para asignar cajas a usuarios, en `src/lib/permissions/can.ts`.
- **Integraciones:** n/a (no toca MP/ARCA/WhatsApp).

## Riesgos

- **Período de rendición vs. período de caja** → ambos se anclan a su propio "último cierre"
  (rendición por mozo, corte por caja); se documentan como independientes para no acoplar arqueo y
  rendición. La rendición usa `gt("created_at", ultima_rendicion)` sobre `payments` filtrados por
  `attributed_mozo_id`, igual patrón que `getCajaLiveStats`.
- **Atribución del mozo** → depende de `payments.attributed_mozo_id` (derivado server, no input del
  cliente). Pagos sin mozo atribuido (ej. take-away de mostrador) **no** entran en ninguna rendición.
- **Timezone AR** → los límites de período se comparan por `created_at` (timestamptz); el rótulo del
  turno se muestra en hora AR vía `date-fns-tz`, nunca `Date` naïve.
- **Dinero en centavos** → todos los montos `*_cents`; diferencia = entregado − esperado.

## Preguntas abiertas

- [ ] ¿La rendición se cierra **por mozo** a demanda (el encargado la registra cuando el mozo llega
      a rendir) o se ata al fichaje de salida? Asumimos a demanda, alineado con §7.10.
- [ ] Si un mozo opera dos cajas en el turno, ¿su rendición es **global** (todos sus pagos) o por
      caja? Asumimos global por mozo; la asignación caja↔usuario es informativa/operativa.
- [ ] ¿Un usuario puede tener **varias** cajas asignadas y una caja **varios** usuarios? Asumimos
      n:m (por eso `caja_user_assignments` es tabla puente).
