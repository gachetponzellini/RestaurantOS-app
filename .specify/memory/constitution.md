<!--
SYNC IMPACT REPORT
- Versión: (inicial) → 1.0.0
- Ratificación inicial: 2026-07-14. Porta los gates del proceso SDD previo
  (openspec/config.yaml — gentle-ai) a spec-kit sin aflojarlos.
- Principios: I Multi-tenancy estricto · II Test-First (lógica de negocio) ·
  III Server Actions + Zod · IV Dinero en centavos + timezone AR ·
  V Secretos server-only · VI Spec-Driven con approval gate · VII Migraciones versionadas
- Secciones: Restricciones de stack · Flujo de trabajo y quality gates · Gobernanza
- Plantillas revisadas: spec-template.md ✅ · plan-template.md ✅ · tasks-template.md ✅
  (los gates de design/tenant/dinero se chequean en /speckit-plan y /speckit-tasks)
- TODO: confirmar con Pacho si algún gate se relaja (default: NO se relaja).
-->

# Constitución de RestaurantOS

RestaurantOS es un SaaS multi-tenant de gestión integral para restaurantes (paquete `pedidos`,
dominio `pedidos.com.ar`), en fase de pre-piloto con cliente real (golf-house: locales House y Golf).
Idioma del producto y de las specs: **español (es-AR)**. Esta constitución gobierna cómo los agentes de
IA trabajan en este repo. Es la autoridad máxima: ante conflicto con cualquier otra guía, **gana la
constitución**.

## Principios fundamentales

### I. Multi-tenancy estricto (NO NEGOCIABLE)

Todo dato pertenece a un negocio y se aísla por `business_id` **+ RLS de Postgres**. Ninguna query, action
o webhook puede cruzar negocios. Reglas duras:
- Toda tabla de negocio lleva `business_id` y policies RLS que scopean por miembro del negocio.
- Los accesos server-side que usan `service_role` (webhooks, jobs) validan el `business_id` explícitamente;
  nunca confían en un id que venga del cliente sin chequear pertenencia.
- Un secreto/credencial de un negocio jamás se usa para otro.
- **RLS se prueba con el JWT del rol real** (mozo/encargado/admin), nunca con `service_role`, antes de dar
  algo por verificado.

### II. Test-First para lógica de negocio (NO NEGOCIABLE)

TDD obligatorio para toda lógica que toque **dinero, estados o permisos**: test que falla (rojo) →
implementación → verde → refactor. La lógica de dominio se escribe **pura y testeable** (ej.
`state-machine.ts`, `expected-cash.ts`) con tests co-ubicados: `*.test.ts` (unidad) y
`*.integration.test.ts` (flujos con DB). `pnpm typecheck` + `pnpm test` en verde es condición para cerrar
cualquier cambio.

### III. Server Actions + Zod para toda mutación

Las mutaciones viven **solo** en Server Actions (`actions.ts`), validadas con **Zod en el borde**. Nunca se
escribe a la base desde el cliente. Los permisos se chequean de forma centralizada en
`src/lib/permissions/can.ts` (roles: dueño/admin, encargado, mozo, personal). Las lecturas van en
`queries.ts`. El patrón de módulo de dominio (`src/lib/<dominio>/`) es la forma canónica.

### IV. Dinero en centavos + timezone AR (NO NEGOCIABLE)

- Todo importe se representa en **centavos** (`*_cents`); el formateo pasa por `src/lib/currency.ts`. Nunca
  floats para dinero.
- La propina **no** integra el monto facturable a ARCA (ni métricas de venta): se maneja por fuera.
- Toda fecha/hora de operación (turnos, caja, crons) usa timezone explícita
  **America/Argentina/Buenos_Aires** (date-fns-tz). Nunca un `Date` naïve para turnos/caja/crons.
- Los upserts se hacen por columna de negocio, no por `id` arbitrario.

### V. Secretos server-only, nunca expuestos (NO NEGOCIABLE)

Ningún secreto (API keys, tokens, `SUPABASE_SERVICE_ROLE_KEY`, webhook secrets) se hardcodea, commitea,
loguea ni se devuelve al cliente. Los secretos por negocio viven en tablas **service-role-only** (RLS sin
policy para `authenticated`), no en columnas de tablas legibles por members. Al pedir output que pudiera
contenerlos, se enmascara. La UI solo ve **estado** ("conectado: sí/no"), nunca el valor.

### VI. Spec-Driven con approval gate

No se escribe código de producción hasta que **spec + plan estén aprobados** (approval gate). El flujo es
`/speckit-specify → /speckit-plan → /speckit-tasks → /speckit-implement`, con `/speckit-clarify` y
`/speckit-analyze` como refuerzos. Las specs se escriben en **español**, con requisitos verificables y
escenarios **Dado/Cuando/Entonces**, y marcadores **ADDED/MODIFIED/REMOVED** para distinguir lo nuevo de lo
que cambia sobre el comportamiento vigente. No se inventan rutas: se referencian paths reales del repo.

### VII. Migraciones versionadas

Toda feature de datos = **una migración numerada** (`supabase/migrations/00NN_*.sql`) + policies RLS +
regenerar tipos (`pnpm db:types`). Nunca cambios a mano en producción. Las migraciones se aplican a la DB
cloud (`tjfufswzsxfujcpoxapx`) vía el MCP de Supabase. La numeración es secuencial y no se reescribe historia.

## Restricciones de stack

- **Framework:** Next.js 15.5 (App Router, Turbopack) · React 19 · TypeScript 5.
- **Datos/Auth:** Supabase (Postgres + RLS, Auth SSR `@supabase/ssr`, Google OAuth).
- **UI:** Tailwind v4 · shadcn (Radix + `@base-ui/react`) · lucide-react · sonner · recharts · next-themes · @dnd-kit.
- **Forms:** react-hook-form + Zod 4. **Estado cliente:** Zustand. **Realtime:** Supabase channels.
- **Pagos:** Mercado Pago SDK (config por negocio en `businesses`). **Facturación AR:** ARCA GPSF Gateway
  (async, API key por negocio en `afip_gateway_credentials`). **Chatbot:** LangChain (`@langchain/anthropic`).
- **Fechas:** date-fns / date-fns-tz. **Testing:** Vitest. **Package manager:** pnpm.
- **Multi-tenancy:** rutas `src/app/[business_slug]/…`; prod = subdominio, dev = path.
- Infra estándar Vercel + Supabase. Otra infra solo con aprobación explícita. No renombrar repos/ramas/proyectos.

## Flujo de trabajo y quality gates

**Design/plan reforzado obligatorio cuando** el cambio (cualquiera de estas):
1. toca una **máquina de estados** o el flujo de comandas/estados de pedido;
2. cruza **≥2 módulos de dominio** o cambia contratos entre ellos;
3. toca **dinero real**: pagos, propina, caja, facturación ARCA;
4. afecta **multi-tenancy, RLS o deploy on-site**;
5. integra un **servicio externo** o maneja un **secreto** nuevo.

En esos casos, `/speckit-plan` documenta contexto, opciones consideradas, decisión, trade-offs e impacto en
datos (migración/policies) y en máquinas de estado, **antes** de tocar código.

**Verify gate (antes de cerrar):** `pnpm typecheck` + `pnpm test` en verde; revisión fresca de los archivos
tocados; ningún secreto en código/tests/logs; `get_advisors` sin alertas nuevas si hubo migración; y
verificación en vivo con el **rol real** del usuario (nunca `service_role`). Un error corregido que no
estaba en el checklist se agrega a `qa-brain/aprendidos.md`.

**Trazabilidad:** todo trabajo corresponde a una GitHub Issue dentro del milestone (sprint) activo. Commits
atómicos `tipo: descripción` referenciando la issue. Bloqueado → comentar `BLOQUEADO: <motivo>` en la issue
+ avisar en el Discord del proyecto; no improvisar workarounds silenciosos.

## Gobernanza

Esta constitución prevalece sobre cualquier otra práctica. Las enmiendas se documentan en este archivo con
un Sync Impact Report, se versionan y requieren justificación:
- **MAJOR:** se quita o redefine incompatiblemente un principio (ej. relajar un gate NO NEGOCIABLE).
- **MINOR:** se agrega un principio/sección o se amplía materialmente una guía.
- **PATCH:** aclaraciones, wording, correcciones no semánticas.

Relajar un gate marcado NO NEGOCIABLE requiere aprobación explícita (Pacho) y queda registrado como cambio
MAJOR. Toda PR/cambio verifica cumplimiento con esta constitución; la complejidad que la contradiga debe
justificarse o rechazarse. El contexto operativo vivo (stack ampliado, decisiones, specs previas) vive en el
repo Brain y en `AGENTS.md`; esta constitución fija los principios, no los duplica.

**Versión:** 1.0.0 · **Ratificada:** 2026-07-14 · **Última enmienda:** 2026-07-14
