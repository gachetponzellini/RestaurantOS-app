# Feature Specification: Autoinstalador del print-agent desde el panel

**Feature Branch**: `046-print-agent-autoinstalador`

**Created**: 2026-07-15

**Status**: Draft

**Input**: Pedido de Juan 2026-07-15 — "¿hay alguna manera de dejar esto más automático, y que puedan instalar el print-agent desde la página, en alguna parte de la configuración?". Fase 2 (bootstrapper de un clic) **descartada por overkill**; alcance = descarga self-service desde el panel a una sola PC.

## Contexto y problema

El print-agent (spec [28](../028-.../spec.md) config por sector · spec [33](../033-.../spec.md) aviso de fallo · spec [35] reimpresión + heartbeat) ya imprime en producción en golf-jcr. Pero **instalarlo es artesanal**: hoy alguien (el dev) arma a mano una carpeta con `print-agent.exe` + un `config.json` editado a mano (serverUrl, businessId, key) + un `.bat`, y la copia a la PC del local. Tres fricciones:

1. **`config.json` a mano.** Editar JSON (URL, businessId, key) es propenso a error y no lo puede hacer el encargado — depende del dev.
2. **Key global compartida.** El endpoint del agente ([`agent-auth.ts`](../../src/app/api/print-agent/agent-auth.ts)) valida contra **una** `PRINT_AGENT_KEY` global (env de Vercel). La misma key sirve para **cualquier** negocio → una key filtrada compromete a todos los locales, y no se puede rotar por negocio.
3. **Distribución manual.** El `.exe` (~57 MB) se pasa por pendrive/mano. No hay una fuente única desde donde bajarlo ya configurado.

**Objetivo:** que un admin/encargado, desde `configuración`, se baje el agente **ya configurado para su negocio** y lo instale en **una** PC del local, sin tocar JSON ni manejar la key. La key pasa a ser **por negocio** (patrón canónico de secreto-por-negocio del repo, [`afip_gateway_credentials`](../../supabase/migrations/0003_afip_gateway.sql)).

**Principio rector:** el binario grande (57 MB, inmutable) y el secreto por-negocio son problemas distintos → **no se mezclan**. El `.exe` se sirve **fuera de Vercel** (Supabase Storage privado, patrón `supplier-invoices`); el `config.json` (chico) lo genera un route handler detrás de sesión admin.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Descargar el agente ya configurado (Priority: P1)

Como encargado/admin, entro a **configuración → card "Agente de impresión"**, toco **"Descargar instalador"** y obtengo el `.exe` + un `config.json` **ya rellenado** para mi negocio (serverUrl, businessId, key, transport, pollMs) + el `instalar.bat`. Lo descomprimo en la PC del local, doble clic en `instalar.bat` y listo — imprime. Nunca edito JSON ni pego una key.

**Why this priority**: Es el corazón del pedido — elimina la dependencia del dev y el JSON a mano. Sin esto no hay feature.

**Independent Test**: Con sesión admin, tocar "Descargar" → baja un `config.json` válido con los datos de ESE negocio + un link al `.exe`. Correr el agente con ese config imprime contra el server correcto.

**Acceptance Scenarios**:

1. **Dado** un admin con sesión en el negocio A, **Cuando** toca "Descargar instalador", **Entonces** obtiene un `config.json` con `serverUrl` del negocio, `businessId` de A, `printAgentKey` de A, `transport:"network"`, `pollMs`, y un link de descarga del `.exe`.
2. **Dado** un negocio que nunca instaló el agente, **Cuando** el admin toca "Descargar" por primera vez, **Entonces** el server **crea la key del negocio lazily** (si no existía) y la incluye en el config — sin pasos extra.
3. **Dado** un usuario **sin** permiso de gestión del negocio (o sin sesión), **Cuando** intenta pegar la URL del instalador, **Entonces** se rechaza (403/redirect) y **no** se expone ninguna key.

---

### User Story 2 - Key por negocio (reemplaza la global) (Priority: P1)

Como plataforma, cada negocio tiene **su propia** print-agent key (no la global compartida). El endpoint del agente acepta la key del negocio **además** de la global (retrocompat), de modo que los agentes ya desplegados con la global siguen andando durante la transición.

**Why this priority**: Es el prerequisito de la descarga self-service (el config lleva la key del negocio) y cierra el agujero de seguridad de la key global. P1 junto con US1.

**Independent Test**: Con la key del negocio A, el `GET /api/print-agent?business_id=A` responde 200; con la key de A contra `business_id=B` responde 401; con la key global sigue respondiendo 200 (retrocompat).

**Acceptance Scenarios**:

1. **Dado** el negocio A con su key, **Cuando** el agente hace `GET/POST/heartbeat` con esa key y `business_id=A`, **Entonces** autentica OK.
2. **Dado** la key del negocio A, **Cuando** se usa con `business_id=B`, **Entonces** se rechaza (401) — una key no vale para otro negocio.
3. **Dado** la `PRINT_AGENT_KEY` global aún configurada, **Cuando** un agente viejo la usa, **Entonces** sigue autenticando (retrocompat) hasta que se ejecute el plan de retiro.
4. **Dado** la comparación de keys, **Cuando** se valida el token, **Entonces** se usa comparación **timing-safe** (no `===`).

---

### User Story 3 - Estado del agente en el panel (Priority: P2)

Como admin, en la card "Agente de impresión" veo si el agente está **conectado** ("último latido hace 12 s") o **caído** ("sin conexión hace 8 min"), reusando el heartbeat del spec [35] (`print_agent_status`). Así sé si la PC del local está imprimiendo sin ir a Operación.

**Why this priority**: Da visibilidad de salud donde se instala/gestiona el agente. P2 porque el dato ya existe (spec 35) y solo se re-expone.

**Independent Test**: Con un heartbeat reciente en `print_agent_status`, la card muestra "conectado"; sin latidos por más del umbral (60 s), muestra "sin conexión hace X".

**Acceptance Scenarios**:

1. **Dado** un `print_agent_status.last_seen_at` fresco (< 60 s), **Cuando** el admin abre la card, **Entonces** ve badge verde "Conectado".
2. **Dado** ningún latido hace > 60 s, **Cuando** abre la card, **Entonces** ve badge rojo "Sin conexión desde hace X" + botón "Volver a descargar instalador".

---

### User Story 4 - Regenerar la key (Priority: P2)

Como admin, desde un menú de la card puedo **regenerar la key** del negocio (ej. si se filtró o cambió de PC). Se me advierte que el agente actual dejará de imprimir hasta reinstalar con la key nueva; al confirmar, la key vieja se invalida y puedo descargar el `config.json` nuevo.

**Why this priority**: Higiene de seguridad y recuperación. P2 porque no bloquea la primera instalación.

**Independent Test**: Regenerar → la key vieja deja de autenticar (401), la nueva autentica, y el nuevo `config.json` trae la key nueva.

**Acceptance Scenarios**:

1. **Dado** un negocio con key, **Cuando** el admin confirma "Regenerar key", **Entonces** se genera una key nueva, la vieja **deja de autenticar**, y se ofrece descargar el config actualizado.
2. **Dado** la regeneración, **Cuando** se muestra la key nueva, **Entonces** aparece **una sola vez** en texto plano (banner copiable) y nunca se puede volver a leer desde la UI.

### Edge Cases

- **Doble descarga (exe + config):** el `.exe` viene por signed URL de Storage y el `config.json` por route handler → la UI dispara ambas descargas; el `.bat` asume que ambos quedan en la misma carpeta (el usuario descomprime juntos).
- **Signed URL expirado:** si el link del `.exe` caducó (TTL ~1 h), volver a tocar "Descargar" genera uno nuevo.
- **Dos PCs con la misma key (duplicados):** correr el agente en 2 PCs con la misma key **duplica tickets** (el pull no tiene lock). La card **advierte** si detecta 2 agentes (heartbeat con distinto `agent_id`/hostname); el lock real es fuera de alcance (ver Non-Goals).
- **Key global durante la transición:** mientras exista `PRINT_AGENT_KEY` global, cualquiera con ella autentica contra cualquier negocio → el retiro de la global es parte del alcance, no "algún día".
- **`.exe` no subido / versión faltante:** si el bucket no tiene el binario, la card muestra "instalador no disponible" en vez de un link roto.

## Requirements *(mandatory)*

### Functional Requirements

**Key por negocio (US2)**

- **FR-001 (ADDED)**: MUST existir una tabla `print_agent_credentials(business_id pk → businesses, api_key text, created_at, updated_at)` **service-role-only**, con RLS `is_platform_admin()` en las 4 policies, espejando exactamente [`afip_gateway_credentials`](../../supabase/migrations/0003_afip_gateway.sql). La `api_key` **nunca** se expone al cliente salvo en el momento de creación/rotación.
- **FR-002 (ADDED)**: MUST existir un flag no-sensible `businesses.print_agent_key_set boolean not null default false` (patrón `afip_gateway_connected`) para que la UI sepa si hay key **sin poder leerla**.
- **FR-003 (MODIFIED)**: `verifyAgentKey` ([`agent-auth.ts`](../../src/app/api/print-agent/agent-auth.ts)) MUST aceptar **(a)** la `PRINT_AGENT_KEY` global (retrocompat) **o (b)** la `api_key` del `business_id` reportado, comparando con **`timingSafeEqual`**. Los 3 callers (`GET`/`POST`/`heartbeat` de `print-agent`) MUST parsear el `business_id` **antes** de llamar `verifyAgentKey(req, businessId)`.
- **FR-004 (ADDED)**: Una key de negocio MUST NOT autenticar contra otro `business_id`. (Endurece de yapa el ownership check del `POST`.)
- **FR-005 (ADDED)**: El server MUST generar la key con `crypto.randomBytes` (prefijo `pak_live_…`) y persistirla con service client (`upsert onConflict:"business_id"`), seteando `businesses.print_agent_key_set=true`. `ensurePrintAgentKey` (lazy, no devuelve la key) + `rotatePrintAgentKey` (devuelve la key en claro **solo** para mostrarla una vez).

**Descarga self-service (US1)**

- **FR-006 (ADDED)**: MUST existir un route handler (bajo `admin/(authed)/.../print-agent/instalador`) gateado con `ensureAdminAccess` + `canManageBusiness` ([`context.ts`](../../src/lib/admin/context.ts)) que, en el primer hit, llama `ensurePrintAgentKey(businessId)` y devuelve el `config.json` con `Content-Disposition: attachment`, payload `{ serverUrl, printAgentKey, businessId, transport:"network", pollMs }`.
- **FR-007 (ADDED)**: El `.exe` (~57 MB) MUST servirse **fuera de Vercel** — bucket privado de Supabase Storage `print-agent-releases`, descargado por **signed URL** corto (`createSignedUrl`, patrón [`proveedores/queries.ts`](../../src/lib/proveedores/queries.ts)). El binario **no** pasa por un route handler de Next (límite de respuesta serverless ~4.5 MB) ni por `/public`.
- **FR-008 (ADDED)**: La card "Agente de impresión" en `configuración` (patrón `SettingsSection`, junto a "Comanderas") MUST ofrecer **"Descargar instalador"** (dispara descarga del config + del `.exe`) e instrucciones cortas de instalación (descomprimir + `instalar.bat`).

**Estado y rotación (US3, US4)**

- **FR-009 (ADDED)**: La card MUST mostrar el estado del agente derivado de `print_agent_status.last_seen_at` (spec [35]): "Conectado (hace X)" si `< 60 s`, "Sin conexión (hace X)" si no.
- **FR-010 (ADDED)**: La card MUST permitir **regenerar la key** (con confirmación que advierte que el agente actual deja de imprimir hasta reinstalar). La key nueva se muestra **una sola vez** (banner copiable) y se ofrece el config actualizado.

**Retiro de la key global**

- **FR-011 (ADDED)**: El spec MUST incluir el **plan de retiro** de `PRINT_AGENT_KEY` global: (1) reinstalar cada local con su key por-negocio, (2) confirmar por heartbeat que todos migraron, (3) borrar la env `PRINT_AGENT_KEY` de Vercel. Hasta el paso 3, la global sigue válida (documentado como riesgo abierto, no permanente).

**Aviso de duplicados (mínimo)**

- **FR-012 (ADDED)**: Si `print_agent_status` (o el heartbeat) reporta **dos agentes distintos** para el mismo negocio, la card MUST mostrar un warning "Detectamos 2 PCs corriendo el agente — esto duplica comandas". (No implementa lock; solo avisa.)

### Non-Goals (fuera de alcance)

- **Fase 2 — bootstrapper de un clic** (baja exe + escribe config + registra autostart con un código de enrolamiento de un solo uso): **descartado por overkill** para dos locales que se instalan una vez. Firma de código / SmartScreen / deep-link quedan afuera.
- **Lock/lease de una-sola-PC** en el pull (evitar duplicados de raíz): ortogonal a la instalación; acá solo se **avisa**. Queda como pregunta abierta / spec futuro.
- **Autoactualización del `.exe`**: la card sirve la versión subida al bucket; el agente no se autoactualiza en esta fase.
- **Hash de la key (sha256):** en esta fase se guarda en plano (consistente con `afip_gateway_credentials`); migrar a hash es un cambio aislado posterior.
- **Reescribir el agente / cambiar el transporte:** el `agent.mjs` de referencia no cambia (solo consume el config generado). El `.exe` se recompila desde el mismo fuente.

### Key Entities

- **`print_agent_credentials`**: secreto por negocio (`business_id` pk, `api_key`). Service-role-only, RLS platform-admin. Origen del patrón: `whatsapp_credentials` / `afip_gateway_credentials`.
- **`businesses.print_agent_key_set`**: flag booleano no-sensible (¿hay key?), leído por la UI sin exponer el secreto.
- **Bucket `print-agent-releases`** (Supabase Storage, privado): aloja el `.exe` por versión; se accede por signed URL.
- Reusa **`print_agent_status`** (spec [35]) para el estado conectado/caído.

## Success Criteria *(mandatory)*

- **SC-001**: Un admin puede, desde configuración, bajar el agente ya configurado para su negocio e instalarlo en una PC **sin editar JSON ni pegar keys**; el agente imprime contra el server correcto.
- **SC-002**: Cada negocio tiene su key; la key de un negocio no autentica contra otro; la key global sigue funcionando hasta ejecutar el retiro. Comparación timing-safe.
- **SC-003**: La card muestra correctamente conectado/caído (umbral 60 s) y permite regenerar la key (vieja deja de autenticar, nueva autentica).
- **SC-004**: El `.exe` se baja por signed URL de Storage (no por Vercel); el config por route handler con `Content-Disposition`. Ningún endpoint expone la key sin sesión admin.
- **SC-005**: `pnpm typecheck` + `pnpm test` + `pnpm build` en verde; tests de `verifyAgentKey` (global, per-business, cross-negocio, timing-safe) y del route de instalador (403 sin sesión, genera key lazy, headers correctos). Verify en vivo con rol real (admin).

## Assumptions

- El repo ya tiene el patrón de **secreto-por-negocio** (`afip_gateway_credentials`, `0003`) y de **signed URL de Storage** (`supplier-invoices`, `proveedores/queries.ts`) — se reusan tal cual, sin libs nuevas.
- El bucket `print-agent-releases` se crea por dashboard (no hay `insert into storage.buckets` en migraciones del repo).
- El spec [35] ya provee `print_agent_status` + heartbeat; esta feature solo lo re-expone en configuración.
- La resolución de `serverUrl` por negocio (subdominio en prod) está definida por el deploy; el config usa el host que corresponda al negocio.
- Próxima migración libre = **`0011`** (la `0010` la toma el WIP de spec 045). Confirmar al implementar.
