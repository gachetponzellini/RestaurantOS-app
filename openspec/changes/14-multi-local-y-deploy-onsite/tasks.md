# Tareas — 14-multi-local-y-deploy-onsite Multi-local, on-site y panel consolidado

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.
> Marcá qué es **app** (este repo) vs **infra/operación** (fuera del repo). Secretos por negocio,
> server-only, **nunca** clonados ni expuestos. Scope `business_id` + RLS; consolidado sólo dueños.

## 1. Datos

- [ ] Migración `supabase/migrations/00NN_grupos_y_meta.sql` (el número se asigna al implementar; la
      última real es `0051`):
  - [ ] **Grupo de negocios**: `business_groups` (id, name, owner_user_id) + `business_group_members`
        (group_id, business_id) — modelo tabla puente (ver Pregunta abierta del proposal).
  - [ ] **Meta/WhatsApp por negocio**: en `businesses`, columnas server-only `whatsapp_phone text`,
        `meta_account_ref text`, `meta_api_token text` (server-only).
  - [ ] RLS: `business_groups`/`business_group_members` legibles para el **owner** del grupo y platform
        admin; el consolidado scopea por `group_id`. Las columnas de secreto de Meta NO legibles por
        roles no-admin. Agregar policies plataforma (`is_platform_admin`) siguiendo el patrón de `0039`.
- [ ] `pnpm db:types` → `src/lib/supabase/database.types.ts`

## 2. Dominio (TDD)

- [ ] Test (rojo): `src/lib/platform/consolidado.test.ts` (nuevo) — agregación por grupo: suma de House +
      Golf en centavos; un grupo no incluye negocios ajenos.
- [ ] Test (rojo): `src/lib/permissions/can.test.ts` (extender) — `canViewConsolidado`: owner del grupo →
      true; encargado/mozo/personal → false; platform admin del consolidado del dueño no aplica (ese ve
      `getPlatformOverview`).
- [ ] Test (rojo): `src/lib/platform/clone-business.test.ts` (nuevo) — la clonación copia estructura
      (categorías/productos/stations/salones/mesas) y **NO** copia secretos (mp/arca/meta) ni datos
      operativos.
- [ ] Implementar `canViewConsolidado` (dueño del grupo) en `src/lib/permissions/can.ts`.
- [ ] Implementar agregación consolidada por grupo en `src/lib/platform/queries.ts` (reusando el patrón
      de `getPlatformOverview`, pero scopeado por `group_id`).
- [ ] Implementar clonación de estructura en `src/lib/platform/actions.ts` (lista blanca de tablas de
      estructura; excluir explícitamente columnas de secreto y datos operativos).

## 3. Server Actions / config

- [ ] Acción de provisioning por clonación en `src/lib/platform/actions.ts` (gate: platform admin /
      owner del grupo; Zod; no copiar secretos).
- [ ] Acción de carga de **Meta/WhatsApp por negocio** (admin del local; Zod; secreto en columna
      server-only; nunca devolver el secreto). Análoga a la config de MP/ARCA.
- [ ] **Contrato de impresión (app)**: handler/endpoint que expone el contenido imprimible de una comanda
      por `station_id` y la transición `pendiente → en_preparacion` que el agente confirma (formaliza el
      punto ya documentado en `src/lib/comandas/types.ts`/`actions.ts`). Autenticación del agente con
      credencial server-only por negocio.

## 4. UI

- [ ] `src/app/(platform)/` (o ruta de dueño): vista del **consolidado del grupo**, gateada por
      `canViewConsolidado`. Distinta del overview de platform admin.
- [ ] `src/components/admin/…`: pantalla de **provisioning** (clonar local) para owner/plataforma.
- [ ] `src/components/admin/…`: pantalla de **Meta/WhatsApp por negocio** (mostrar "conectado: sí/no",
      nunca el secreto).

## 5. Infra / operación (NO app — documentar, no codear acá)

- [ ] Documentar el **print agent** on-site: instala servicio en el servidor local, descubre comanderas
      ESC/POS, hace *pull* de comandas `pendiente`, imprime por sector y confirma a la app
      (`pendiente → en_preparacion`). **Fuera del repo Next.js.**
- [ ] Documentar exposición de puertos con credenciales + AnyDesk + comanderas WiFi en LAN (no internet).
      **Operación.**
- [ ] Documentar el alta de **Meta/WhatsApp** por local (crear/conectar cuentas y números, community
      manager) — §3.1 "arrancar Meta el lunes". **Operación.**

## 6. Verify

- [ ] `pnpm typecheck` y `pnpm test` en verde
- [ ] Revisión fresca: confirmar que el consolidado NO filtra negocios fuera del grupo y que la clonación
      NO copia ningún secreto (mp/arca/meta) ni dato operativo.
- [ ] Confirmar que encargado/mozo no acceden al consolidado y que cada local mantiene su scope
      `business_id`.
- [ ] Marcar ✅ en `openspec/changes/README.md`
