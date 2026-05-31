# 14-multi-local-y-deploy-onsite — Duplicar House+Golf, deploy on-site con comanderas, panel consolidado (sólo dueños)

> Estado: 📋 propuesto · Origen: Reunión §2 · §4 (Multi-local) · §7.23 · §6 · §5 · Design: sí

## Por qué

El cliente piloto es un complejo gastronómico con **dos locales** —**House** y **Golf**— y cada local es
un `business` separado (§2, §7.23). La reunión decidió: (a) **duplicar el sistema** para los dos locales
("una vez instalado y funcionando en uno, se instala en el otro; el back es prácticamente igual; mismos
platos con mínima variedad", §7.23); (b) un **panel consolidado House + Golf** que **sólo puedan ver los
dueños** (no encargados) (§4 Multi-local, §7.23); (c) el deploy es **on-site**: el sistema corre en un
servidor local conectado a las **comanderas** (impresoras de cocina por sector), se instala un agente y
se **exponen puertos con credenciales** para acceso remoto por AnyDesk (§7.23, §5); (d) **Meta/MP/WhatsApp
por local**: cada local necesita su número de WhatsApp, su cuenta de Meta y su Mercado Pago por separado
—"lo único quilombo es Meta" (§7.23, §6, tabla §5).

El sistema ya es multi-tenant (rutas `src/app/[business_slug]/…`, scope `business_id` + RLS, capa de
plataforma en `src/lib/platform` + `src/app/(platform)/negocios`, helper `is_platform_admin()` en
`0006`). La pieza que **falta a nivel app** es el **panel consolidado** para dueños que cruzan negocios.
El resto —duplicación y on-site— es mayormente **provisioning e infraestructura/operación fuera del
repo**, que este cambio documenta y delimita explícitamente.

## Qué cambia

- **Panel consolidado House + Golf (app)**: una vista que agrega métricas de los negocios que un **dueño**
  posee (ventas, pedidos, etc.), respetando RLS: **sólo los dueños cruzan negocios**; encargados/mozos
  siguen scopeados a su `business_id`. Hoy `getPlatformOverview` (`src/lib/platform/queries.ts`) ya
  consolida **todos** los negocios pero está reservado al **platform admin** (equipo dev), no al dueño
  del complejo. Se introduce el concepto de **grupo de negocios** (los locales de un mismo dueño) y un
  consolidado acotado a ese grupo.
- **Provisioning / duplicación de un local (app)**: a partir de un negocio existente (House), crear otro
  (Golf) **clonando la estructura** (categorías, productos, sectores/stations, salones/mesas, config no
  sensible) sin copiar datos operativos ni **secretos**. Extiende `createBusiness`
  (`src/lib/platform/actions.ts`).
- **Separación de credenciales por negocio (app + operación)**: dejar explícito que MP
  (`businesses.mp_access_token`/`mp_webhook_secret`), ARCA (cambio 13) y **Meta/WhatsApp** se configuran
  **por `business_id`** y **nunca** se clonan al duplicar. Se agrega el espacio de config de
  **Meta/WhatsApp por negocio** (número + credenciales server-only) — lo único que falta de credenciales.
- **Deploy on-site y comanderas (infra/operación, documentado, NO app)**: cómo la comanda viaja del web
  app a la impresora en la **red local** — vía un **agente/servicio de impresión local** (el
  "print agent", Bloque 4b ya referenciado en el código). Se delimita qué es **app Next.js** (crear la
  comanda + exponer su contenido para imprimir + marcar `pendiente → en_preparacion`) y qué es
  **infra/operación** (instalar el agente, mapear impresoras por sector, exponer puertos con
  credenciales, AnyDesk, comanderas WiFi en LAN).

## Alcance

**Incluye (app):**
- **Grupo de negocios** y **panel consolidado** acotado a los locales de un dueño, gateado por un permiso
  nuevo "ver consolidado" que **sólo** tienen los dueños (no encargados): migración nueva + lógica de
  agregación en `src/lib/platform/` (reusando el patrón de `getPlatformOverview`).
- **Provisioning por clonación**: acción que crea un negocio nuevo copiando **estructura** (no datos
  operativos ni secretos) desde un negocio plantilla, en `src/lib/platform/actions.ts`.
- **Config de Meta/WhatsApp por negocio**: columnas server-only en `businesses` (número + credenciales) y
  pantalla de carga (admin), análoga a la de MP/ARCA. **No** se implementa el envío de WhatsApp (eso es
  el cambio 15); acá sólo el almacenamiento seguro por negocio.
- **Contrato de impresión del lado app**: endpoint/handler que expone el contenido imprimible de una
  comanda y la transición `pendiente → en_preparacion` que el agente confirma (formaliza el punto
  documentado en `src/lib/comandas/types.ts` y `actions.ts`, "la dispara la impresora térmica · Bloque
  4b, pendiente").

**No incluye (fuera de alcance · infra/operación o otros cambios):**
- **El print agent en sí** (binario/servicio que corre en el servidor local, descubre impresoras ESC/POS,
  imprime): es **infraestructura fuera del repo Next.js**. Acá se documenta su contrato, no su código.
- **Instalación on-site**: exponer puertos con credenciales, AnyDesk, red local, compra de comanderas
  WiFi: **operación**, no app.
- **Configuración de Meta** (crear/conectar cuentas y números, alta del community manager): operación
  (§3.1, "arrancar Meta el lunes").
- **Envío de mensajes de WhatsApp / chatbot** y notificaciones configurables: **cambio 15**.
- **Mercado Pago** y **ARCA** como integraciones: ya viven por negocio (MP en `businesses`, ARCA en el
  **cambio 13**). Acá sólo se reafirma que **no se clonan**.
- **Impersonación** de negocios por el equipo (ya existe, `0007`): no se toca.

## Impacto

- **Archivos** (reales): `src/lib/platform/actions.ts` (clonar negocio; no copiar secretos),
  `src/lib/platform/queries.ts` (consolidado por grupo, reusando el patrón de `getPlatformOverview`),
  `src/lib/permissions/can.ts` (permiso "ver consolidado" sólo dueños), `src/app/(platform)/` (vista del
  consolidado del dueño; hoy `(platform)` es sólo para platform admin), `src/components/admin/` (config
  Meta/WhatsApp por negocio), `src/lib/comandas/types.ts` y `actions.ts` (contrato de impresión: exponer
  imprimible + `pendiente → en_preparacion`).
- **Datos:** migración nueva `supabase/migrations/00NN_grupos_y_meta.sql` (el número se asigna al
  implementar; la última real es `0051`):
  - **Grupo de negocios**: tabla `business_groups` + `business_group_members` (qué locales pertenecen al
    grupo) o columna `businesses.group_id` + quién es **dueño** del grupo; RLS para que el consolidado lo
    vea sólo el dueño.
  - **Meta/WhatsApp por negocio**: columnas server-only en `businesses` (ej. `whatsapp_phone text`,
    `meta_account_ref text`, `meta_api_token text` server-only).
  - Policies plataforma (`is_platform_admin`) siguiendo el patrón de `0039` para toda tabla nueva con RLS.
- **Tipos:** regenerar `pnpm db:types` → `src/lib/supabase/database.types.ts`.
- **Permisos:** nuevo helper en `src/lib/permissions/can.ts` (ej. `canViewConsolidado`) que distingue
  **dueño** de **encargado**; el consolidado del dueño NO usa `is_platform_admin` (ese es el equipo dev).
- **Integraciones:** **Meta/WhatsApp** (almacenamiento por negocio, server-only; envío en cambio 15),
  **Mercado Pago** y **ARCA** (ya por negocio; sólo se reafirma no-clonado). **Comanderas/print agent**:
  infra on-site (contrato documentado).

## Riesgos

- **Fuga cross-tenant en el consolidado** → el consolidado debe limitarse a los locales del **grupo del
  dueño** y nunca filtrar otros negocios de la plataforma. Mitigación: el permiso `canViewConsolidado` +
  agregación scopeada por `group_id` con RLS; tests de que un encargado **no** ve el consolidado y un
  dueño **sólo** ve sus locales.
- **Clonar secretos por error** → al duplicar House→Golf, NO copiar `mp_access_token`,
  `mp_webhook_secret`, credenciales ARCA (cambio 13) ni Meta/WhatsApp. Mitigación: la clonación copia una
  **lista blanca de estructura**; los secretos se cargan a mano por local (§7.23 "lo único quilombo es
  Meta").
- **Confundir app con infra** → si el print agent o la exposición de puertos se modela como código del
  repo, se rompe el límite. Mitigación: el design marca **CLARAMENTE** app vs. infra; el repo sólo expone
  el **contrato** de impresión.
- **Comandas en red local sin internet** → las comanderas (incl. WiFi) están en la **LAN del servidor**,
  no en internet (§7.23). El web app puede correr on-site o accederse remoto, pero la **impresión** la
  resuelve el agente local; el contrato no asume conectividad directa app→impresora por internet.
- **Numeración/identidad por local** → cada local es un `business` con su propia config fiscal (cambio
  13), su MP y su Meta; el consolidado **lee** pero no mezcla numeraciones ni cobros.

## Preguntas abiertas

- [ ] **Modelo de grupo**: ¿`business_groups` (tabla puente, escala a N locales) o `businesses.group_id`
      (más simple para 2)? Asumimos **tabla puente** para no atarnos a un dueño/2 locales.
- [ ] **Quién es "dueño"** a efectos del consolidado: ¿rol `admin` de **todos** los locales del grupo, o
      una marca explícita de "owner del grupo"? Asumimos **owner explícito del grupo** (Martín + socio),
      distinto de un `admin` de un solo local.
- [ ] **Alcance de la clonación**: ¿copiamos también salones/mesas y stations, o sólo
      categorías/productos? Asumimos **estructura completa no sensible** (categorías, productos,
      stations, salones, mesas, config de branding) y **nada** operativo ni secreto.
- [ ] **Print agent — contrato**: ¿el agente hace *pull* (consulta comandas `pendiente` y al imprimir
      confirma) o el app hace *push* a un puerto local? Asumimos **pull** desde la LAN (más robusto sin
      exponer el app a la impresora); a confirmar en instalación.
- [ ] **Dónde corre el web app**: ¿on-site en el mismo servidor que las comanderas, o cloud con sólo el
      agente on-site? Asumimos **agente on-site** + app accesible (la decisión final es de instalación).
