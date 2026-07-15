# Tasks: Autoinstalador del print-agent desde el panel

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Issue**: _(por crear)_ · **Estado**: 📋 Draft (nada implementado)

> Alcance = Fase 1 self-service (una sola PC). Bootstrapper (Fase 2) y lock de duplicados = fuera de alcance (ver spec §Non-Goals).

## Fase A — Migración + tipos

- [ ] **T001** `supabase/migrations/0011_print_agent_credentials.sql` — tabla `print_agent_credentials(business_id pk → businesses on delete cascade, api_key text not null, created_at, updated_at)` **copiando** [`0003_afip_gateway.sql`](../../supabase/migrations/0003_afip_gateway.sql): `enable row level security` + 4 policies `is_platform_admin()` + `grant all to anon, authenticated, service_role` + trigger `set_updated_at`. **FR-001**.
- [ ] **T002** En la misma migración: `alter table public.businesses add column print_agent_key_set boolean not null default false` (flag no-sensible, patrón `afip_gateway_connected`). **FR-002**.
- [ ] **T003** `pnpm db:types` → `print_agent_credentials` + `print_agent_key_set` en `database.types.ts`. Aplicar `0011` al **cloud** (`tjfufswzsxfujcpoxapx`) vía MCP; `get_advisors` sin `rls_enabled_no_policy`.

## Fase B — Key por negocio (TDD)

- [ ] **T004** `src/lib/print-agent/credentials-actions.test.ts` — **rojo→verde**: `ensurePrintAgentKey` crea lazy si no existe y **no** devuelve la key; `rotatePrintAgentKey` genera nueva + setea `print_agent_key_set=true` + devuelve la key **una vez**; ambos gateados por `canManageBusiness` (rechaza sin rol) y scopeados por `business_id`. **FR-005, US4**.
- [ ] **T005** `src/lib/print-agent/credentials-actions.ts` + `credentials.ts` — `ensure/rotate` (server actions, gate + service client `upsert onConflict:"business_id"`, key `pak_live_${randomBytes(24).toString("base64url")}`) + lookup server-only `getPrintAgentKey(businessId)`. La key en claro nunca se loguea. **FR-005**.
- [ ] **T006** `src/app/api/print-agent/agent-auth.test.ts` — **rojo→verde**: global matchea (retrocompat); per-business matchea la key correcta del negocio; key de A **rechaza** `business_id=B`; sin businessId y global no-match → false; comparación **timing-safe**. **FR-003, FR-004, US2**.
- [ ] **T007** `agent-auth.ts` — `verifyAgentKey(req, businessId?)` **async**: `global OR per-business` con `timingSafeEqual`; lee la tabla con service client solo si la global no matchea. **FR-003**.
- [ ] **T008** `route.ts` (GET + POST) y `heartbeat/route.ts` — parsear el `business_id` **antes** de `await verifyAgentKey(req, businessId)`; endurecer el ownership del POST a "negocio de la key == business_id reportado" cuando no se usó la global. Ajustar los tests existentes de `print-agent` a la firma async. **FR-003, FR-004**.

## Fase C — Descarga self-service

- [ ] **T009** Crear el bucket privado `print-agent-releases` (dashboard Supabase) y subir el `.exe` actual con path versionado (`print-agent/vX.Y.Z/print-agent.exe`). _(Infra, no código.)_
- [ ] **T010** `src/app/[business_slug]/admin/(authed)/.../print-agent/instalador/route.ts` (+ `.test.ts`) — gate `ensureAdminAccess` + `canManageBusiness`; en el primer hit `ensurePrintAgentKey(businessId)`; devuelve `config.json` con `Content-Disposition: attachment` (`{ serverUrl, printAgentKey, businessId, transport:"network", pollMs }`) + el **signed URL** del `.exe` (`createSignedUrl`, patrón `proveedores/queries.ts`). Test: 403 sin sesión admin; genera key lazy; headers correctos. **FR-006, FR-007**.

## Fase D — UI card

- [ ] **T011** `src/components/admin/settings/print-agent-card.tsx` — card "Agente de impresión" en configuración, junto a "Comanderas" (patrón `SettingsSection`): botón **"Descargar instalador"** (dispara config + `.exe`) + instrucciones cortas (descomprimir + `instalar.bat`). **FR-008, US1**.
- [ ] **T012** En la card: **estado del agente** derivado de `print_agent_status.last_seen_at` (spec 35) — "Conectado (hace X)" / "Sin conexión (hace X)" con umbral 60 s. **FR-009, US3**.
- [ ] **T013** En la card: **"Regenerar key"** con modal de confirmación (advierte que el agente actual deja de imprimir hasta reinstalar) → `rotatePrintAgentKey` → muestra la key nueva **una vez** (banner copiable) + ofrece config nuevo. **FR-010, US4**.
- [ ] **T014** En la card: **warning** si el heartbeat reporta 2 agentes distintos para el negocio ("2 PCs corriendo el agente — duplica comandas"). **FR-012**.

## Fase E — Retiro de la key global

- [ ] **T015** Documentar + ejecutar el retiro de `PRINT_AGENT_KEY` global (FR-011): (1) reinstalar golf-jcr (y demás locales) con su key por-negocio, (2) confirmar por heartbeat que todos migraron, (3) borrar la env `PRINT_AGENT_KEY` de Vercel. **Solo tras confirmar el paso 2.**

## Fase F — Verify + cierre

- [ ] **T016** `pnpm typecheck` + `pnpm test` + `pnpm build` en verde (tests nuevos de auth + credentials + instalador). **SC-005**.
- [ ] **T017** Verify en vivo con **rol real (admin)**: descargar → instalar en una PC → imprime; key por-negocio (200 A/A, 401 A/B, 200 global); estado conectado/caído; regenerar invalida la vieja; instalador sin sesión → 403. **SC-001..004**.
- [ ] **T018** Actualizar [features/comandas.md](../../../wiki/features/comandas.md) (apartado instalación del agente) + crear/cerrar issue de GitHub (ojo mapeo `#issue ≠ #spec`) + loggear en el brain.
