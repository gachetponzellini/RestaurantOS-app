# Tasks: Autoinstalador del print-agent desde el panel

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Issue**: _(por crear)_ · **Estado**: 🟡 **núcleo implementado (2026-07-15)** — código + migración al cloud + tests verdes. Pendiente infra manual (bucket + `.exe`) + verify en vivo.

> Alcance = Fase 1 self-service (una sola PC). Bootstrapper (Fase 2) y lock de duplicados = fuera de alcance (ver spec §Non-Goals).
> **Ojo numeración:** la migración quedó **`0014`** (no `0011` — 0011/0012/0013 ya estaban tomadas por crons).

## Fase A — Migración + tipos

- [x] **T001** `supabase/migrations/0014_print_agent_credentials.sql` — tabla `print_agent_credentials(business_id pk → businesses on delete cascade, api_key, created_at, updated_at)` copiando `0003_afip_gateway.sql`: RLS + 4 policies `is_platform_admin()` + `grant all` + trigger `set_updated_at`. **FR-001**.
- [x] **T002** En la misma migración: `businesses.print_agent_key_set boolean not null default false` (flag no-sensible). **FR-002**.
- [x] **T003** `database.types.ts` — `print_agent_credentials` + `print_agent_key_set` agregados a mano (sin Docker local, mismo criterio que spec 35). Migración **aplicada al cloud** (`tjfufswzsxfujcpoxapx`) vía MCP + verificada: 4 cols, 4 policies, RLS on, flag presente; `get_advisors` no reporta la tabla en `rls_enabled_no_policy`.

## Fase B — Key por negocio (TDD)

- [x] **T005** [`credentials.ts`](../../src/lib/print-agent/credentials.ts) (lookup `getPrintAgentKey`) + [`credentials-actions.ts`](../../src/lib/print-agent/credentials-actions.ts) (`ensurePrintAgentKey` lazy + `rotatePrintAgentKey` + `getPrintAgentInstaller`) — gate `ensureAdminAccess` + `canManageBusiness` + service `upsert`; key `pak_live_…` (`randomBytes`). **FR-005**.
- [x] **T006** [`agent-auth.test.ts`](../../src/app/api/print-agent/agent-auth.test.ts) — global matchea; per-business matchea; key de A rechaza negocio B; sin businessId → false; sin key global sólo valida por negocio; timing-safe (distinta longitud → false sin throw). 9 tests. **FR-003, FR-004**.
- [x] **T007** [`agent-auth.ts`](../../src/app/api/print-agent/agent-auth.ts) — `verifyAgentKey(req, businessId?)` **async**: global `OR` per-business con `timingSafeEqual`; lee la tabla sólo si la global no matchea. **FR-003**.
- [x] **T008** `route.ts` (GET+POST) + `heartbeat/route.ts` — parsean `business_id` **antes** de `await verifyAgentKey(req, businessId)`. Sin efectos secundarios antes del auth. Tests existentes de `route`/`heartbeat` siguen en verde. **FR-003, FR-004**.
- [ ] **T004** _(diferido)_ Test dedicado de `credentials-actions` (gate + lazy create + rotate). El gate está copiado verbatim del `config-actions.ts` (ya testeado); se puede agregar en un follow-up.

## Fase C — Descarga self-service

- [x] **T009** Bucket privado `print-agent-releases` creado (dashboard) + `print-agent.exe` subido a la raíz (54.9 MB, `application/x-msdownload`). Global file size limit del proyecto subido a 100 MB. Verificado por SQL: bucket privado + objeto presente → la signed URL de `getPrintAgentInstaller` ya resuelve.
- [x] **T010** Implementado como **server action** `getPrintAgentInstaller(slug)` (no route handler — más simple y sin auth ad-hoc): gate admin → `ensurePrintAgentKey` lazy → devuelve `configJson` (con `serverUrl` del host actual + key) + `exeUrl` (signed URL best-effort, null si no hay binario). **FR-006, FR-007**. _(Test del action = diferido con T004.)_

## Fase D — UI card

- [x] **T011** [`print-agent-card.tsx`](../../src/components/admin/settings/print-agent-card.tsx) + wire en `configuracion/local/page.tsx` (SettingsSection "Agente de impresión", junto a Comanderas): botón **Descargar instalador** (baja `config.json` vía Blob + abre el `.exe`). **FR-008**.
- [x] **T012** Estado del agente (heartbeat spec 35): badge **Conectado/Sin conexión** con umbral 60 s + reloj vivo. **FR-009**.
- [x] **T013** **Regenerar key** (confirmación inline → `rotatePrintAgentKey` → muestra la key nueva una vez, copiable). **FR-010**.
- [ ] **T014** _(diferido)_ Warning de 2 PCs — requiere `agent_id` en el heartbeat/`print_agent_status` (no existe). En su lugar la card muestra el banner fijo "instalá en una sola PC". **FR-012** parcial.

## Fase E — Retiro de la key global

- [ ] **T015** _(pendiente — post-migración de locales)_ Retirar `PRINT_AGENT_KEY` global: (1) reinstalar golf-jcr con su key por-negocio, (2) confirmar por heartbeat, (3) borrar la env de Vercel. La global sigue válida hasta el paso 3 (retrocompat). **FR-011**.

## Fase F — Verify + cierre

- [x] **T016** `pnpm typecheck` limpio + `pnpm exec vitest run src/app/api/print-agent` → **22/22 verde** (auth + route + heartbeat). (1 timeout flaky en `billing/cuenta.integration` — cloud, ajeno a este cambio.)
- [ ] **T017** _(pendiente)_ Verify en vivo con rol real (admin): descargar → instalar en una PC → imprime; 200 A/A, 401 A/B, 200 global; estado conectado/caído; regenerar invalida la vieja.
- [ ] **T018** _(pendiente)_ Actualizar `wiki/features/comandas.md` + crear issue de GitHub + loggear en el brain.
