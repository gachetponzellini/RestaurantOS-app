# Implementation Plan: Autoinstalador del print-agent desde el panel

**Branch**: `046-print-agent-autoinstalador` | **Date**: 2026-07-15 | **Spec**: [spec.md](./spec.md) | **Issue**: _(por crear)_

## Summary

Convertir la instalación artesanal del print-agent en **self-service desde el panel**, en una sola PC por local. Tres piezas:

1. **Key por negocio (US2)** — nueva tabla `print_agent_credentials` (copia de `afip_gateway_credentials`), `verifyAgentKey` acepta global **o** key-por-negocio (timing-safe). Retrocompatible: la global sigue válida hasta el retiro.
2. **Descarga self-service (US1)** — card "Agente de impresión" en configuración → route handler que genera el `config.json` (con la key del negocio, lazy) + descarga del `.exe` por **signed URL de Supabase Storage** (fuera de Vercel).
3. **Estado + rotación (US3/US4)** — la card re-expone el heartbeat del spec 35 (conectado/caído) y permite regenerar la key.

**Principio rector:** binario grande y secreto por-negocio son problemas distintos → no se mezclan. El `.exe` no pasa por Vercel; el `config.json` sí (es chico).

## Technical Context

**Language/Version**: TypeScript 5 · Next.js 15 (App Router) · React 19 · Supabase (Postgres + RLS + Storage).
**Auth actual**: `verifyAgentKey` ([`agent-auth.ts`](../../src/app/api/print-agent/agent-auth.ts)) es síncrona y compara Bearer contra `process.env.PRINT_AGENT_KEY` con `===`. 3 callers: `GET` (`route.ts`, business_id en query), `POST` (`route.ts`, business_id en body), `heartbeat` (business_id en body).
**Patrón secreto-por-negocio**: [`afip_gateway_credentials`](../../supabase/migrations/0003_afip_gateway.sql) — tabla aparte PK `business_id`, RLS `is_platform_admin()` en las 4 policies, lectura/escritura por service client, + flag `afip_gateway_connected` en `businesses`. Server action con `upsert onConflict:"business_id"`.
**Storage / signed URL**: patrón `supplier-invoices` en [`proveedores/queries.ts`](../../src/lib/proveedores/queries.ts) (`service.storage.from(...).createSignedUrl(path, ttl)`).
**Permisos panel**: `ensureAdminAccess` + `canManageBusiness` ([`context.ts`](../../src/lib/admin/context.ts)); UI en configuración (patrón `SettingsSection`, junto a "Comanderas").
**Storage**: **migración `0011`** (tabla + flag) + bucket `print-agent-releases` (creado por dashboard; no hay `insert into storage.buckets` en migraciones).
**Constraints**: límite de respuesta serverless de Vercel (~4.5 MB) → el `.exe` de 57 MB **no** puede servirse por un route handler ni vivir en `/public`. La key nunca se expone salvo en creación/rotación. Comparación timing-safe.

## Constitution Check

*GATE — toca secretos y multi-tenancy; es el corazón del riesgo.*

| Principio | Impacto | Cómo se respeta |
|---|---|---|
| I · Multi-tenancy | **Mejora** | La key pasa de global a **por negocio**; una key no vale para otro `business_id`. Endurece el ownership del POST. |
| II · Test-First | Alto | TDD de `verifyAgentKey` (global / per-business / cross-negocio / timing-safe) y del route de instalador (403 sin sesión, key lazy, headers). |
| III · Server Actions + Zod | Medio | `ensure/rotatePrintAgentKey` como server actions gateadas (`canManageBusiness`); el route de instalador valida sesión admin. |
| IV · Dinero en centavos | Nulo | — |
| V · Secretos | **Central** | Key en tabla **service-role-only** (RLS platform-admin), nunca al cliente salvo mostrar-una-vez; `timingSafeEqual`; signed URLs cortos; flag no-sensible en `businesses`. |
| VI · Spec-Driven | — | Este plan es el gate. |
| VII · Migraciones | Bajo | **`0011` aditiva** (tabla + flag), sin cambios de máquina de estados; `pnpm db:types`; aplicar al cloud. |

## Decisiones clave

- **Key por negocio reusando `afip_gateway_credentials` tal cual.** No se inventa un patrón: misma estructura de tabla, mismas 4 policies `is_platform_admin()`, mismo flag-espejo en `businesses`. Menos superficie, consistencia.
- **`verifyAgentKey` aditivo, no reemplazo.** `global OR per-business` en ese orden → los agentes ya desplegados (key global) no se rompen. Se vuelve `async` (lee la tabla con service client solo si la global no matchea). De yapa: `===` → `timingSafeEqual`.
- **El `.exe` no pasa por Vercel.** Bucket privado de Storage + signed URL corto → el browser baja los 57 MB directo del CDN de Supabase, esquivando el límite serverless. `/public` queda descartado (infla cada deploy con 57 MB).
- **El `config.json` sí por route handler.** Es chico; se genera on-the-fly con la key del negocio (lazy `ensurePrintAgentKey`), detrás de sesión admin, con `Content-Disposition: attachment`.
- **Una-sola-PC = aviso, no lock.** El pull no tiene lock; resolverlo de raíz (lease/409) es otro tema. Acá la card **avisa** si detecta 2 agentes. La key por-negocio ya acota (regenerar invalida instalaciones viejas).
- **Key en plano, no hash (por ahora).** Consistente con `afip_gateway_credentials`; el lookup compara el token entero. Migrar a sha256 es aislado y posterior.
- **Retiro de la global es parte del alcance.** No queda "colgada": el spec incluye los 3 pasos (reinstalar locales → confirmar por heartbeat → borrar env).

## Project Structure

```text
supabase/migrations/0011_print_agent_credentials.sql   # NEW · tabla print_agent_credentials (copia de 0003) + businesses.print_agent_key_set + trigger updated_at
src/lib/supabase/database.types.ts                      # MOD · pnpm db:types (tabla + columna nuevas)

# Key por negocio
src/lib/print-agent/credentials-actions.ts              # NEW · ensurePrintAgentKey (lazy, no devuelve) + rotatePrintAgentKey (devuelve 1 vez) — gate canManageBusiness
src/lib/print-agent/credentials.ts                      # NEW · lookup server-only de la api_key por business_id (service client)
src/app/api/print-agent/agent-auth.ts                   # MOD · verifyAgentKey async: global OR per-business, timingSafeEqual
src/app/api/print-agent/route.ts                        # MOD · GET/POST: parsear business_id ANTES del verify; endurecer ownership del POST
src/app/api/print-agent/heartbeat/route.ts              # MOD · parsear business_id antes del verify

# Descarga self-service
src/app/[business_slug]/admin/(authed)/.../print-agent/instalador/route.ts  # NEW · genera config.json (Content-Disposition) + signed URL del .exe; gate ensureAdminAccess + canManageBusiness
# bucket "print-agent-releases" (Supabase Storage, privado)                 # (dashboard, NO migración) · sube el .exe por versión

# UI
src/components/admin/settings/print-agent-card.tsx      # NEW · card "Agente de impresión" junto a Comanderas: descargar, estado (spec 35), regenerar key, warning de 2 PCs
# (wire en la página de configuración — SettingsSection)

# Tests
src/app/api/print-agent/agent-auth.test.ts              # NEW · global / per-business / cross-negocio / timing-safe
src/lib/print-agent/credentials-actions.test.ts         # NEW · gate + scope + lazy create + rotate invalida la vieja
src/app/[business_slug]/.../print-agent/instalador/route.test.ts  # NEW · 403 sin sesión, key lazy, headers
```

## Riesgos y mitigación

- **Ventana de la key global.** Mientras exista `PRINT_AGENT_KEY`, cualquiera con ella autentica contra cualquier negocio. Mitigación: ejecutar el retiro (FR-011) apenas los 2 locales estén reinstalados con su key; no dejar la global "por las dudas".
- **Doble impresión (2 PCs, misma key).** El pull no tiene lock. Mitigación en esta fase: warning en la card (FR-012) + doc "una sola PC". Fix real (lease) = fuera de alcance.
- **Signed URL expira / bucket vacío.** Mitigación: TTL ~1 h y regenerar al re-descargar; si no hay binario en el bucket, la card muestra "instalador no disponible".
- **`verifyAgentKey` async rompe callers.** Mitigación: los 3 callers ya tienen el `business_id` a mano; solo hay que reordenar (parse antes del `await verifyAgentKey`). Tests cubren los 3.
- **Versionado del `.exe`.** Path por versión en el bucket (`print-agent/vX.Y.Z/print-agent.exe`); la card sirve "la última". El agente no se autoactualiza (fuera de alcance).

## Verificación (rol real — admin)

1. **Descarga**: configuración → "Descargar instalador" → baja `config.json` con los datos del negocio + `.exe` por signed URL; instalar en una PC → imprime.
2. **Key por negocio**: `GET` con la key de A/`business_id=A` → 200; key de A/`business_id=B` → 401; key global → 200 (retrocompat). Tests timing-safe.
3. **Estado**: card muestra conectado (< 60 s) / caído; regenerar key → la vieja da 401, la nueva 200.
4. **Seguridad**: el route de instalador sin sesión admin → 403; la key nunca aparece en respuestas fuera de creación/rotación.
5. `pnpm typecheck && pnpm test && pnpm build` verde. Aplicar `0011` al cloud + `get_advisors` sin `rls_enabled_no_policy`.
6. **Retiro global** (post-migración de locales): borrar `PRINT_AGENT_KEY` de Vercel y confirmar que todo sigue imprimiendo por heartbeat.
