# Design — 14-multi-local-y-deploy-onsite Multi-local, deploy on-site y consolidado

## Contexto y problema

Este cambio dispara el gate de diseño "**afecta multi-tenancy, RLS o deploy on-site**". Mezcla tres
cosas que conviene **separar nítidamente entre app e infra**:

1. **Consolidado multi-business (app)**: un panel que **cruza negocios** —algo que el sistema
   deliberadamente **no** hace (todo está scopeado por `business_id` + RLS)—, permitido **sólo** para los
   dueños del grupo (§4, §7.23). Hay un precedente parcial: `getPlatformOverview`
   (`src/lib/platform/queries.ts`) ya agrega **todos** los negocios, pero está reservado al **platform
   admin** (equipo dev, `is_platform_admin()` de `0006`). El dueño del complejo **no** es platform admin;
   necesita un consolidado **acotado a sus locales**, no a toda la plataforma.

2. **Provisioning / duplicación (app)**: crear Golf a partir de House clonando **estructura** pero **no**
   secretos ni datos operativos (§7.23, §6). Hoy `createBusiness` (`src/lib/platform/actions.ts`) crea un
   negocio vacío + invita al admin; falta la clonación.

3. **Deploy on-site + comanderas (infra/operación, NO app)**: la comanda viaja del web app a una
   **impresora en la red local**. El código ya documenta que la transición `pendiente → en_preparacion`
   "la dispara la impresora térmica · Bloque 4b, pendiente" (`src/lib/comandas/actions.ts` L503-507,
   `types.ts`). Esa pieza —un **agente/servicio de impresión local**— es **infraestructura fuera del
   repo Next.js**. El riesgo es modelarla como código del app y romper el límite app/infra.

Riesgo transversal: **fuga cross-tenant** (que el consolidado o la clonación expongan datos/secretos de
otros negocios).

## Opciones consideradas

### Consolidado para dueños

1. **Reusar `getPlatformOverview` y darle acceso al dueño.**
   - Pros: cero código nuevo de agregación.
   - Contras: muestra **todos** los negocios de la plataforma → fuga cross-tenant grave; el dueño vería
     locales de otros clientes. Inaceptable.

2. **Modelar un "grupo de negocios" y un consolidado scopeado por `group_id`, gateado por permiso de
   dueño.** *(elegida)*
   - Pros: el dueño ve **sólo** sus locales; RLS por grupo; reusa el patrón de agregación de
     `getPlatformOverview` sin su alcance global; encargados siguen scopeados.
   - Contras: tabla(s) nueva(s) + permiso nuevo.

3. **Marcar al dueño como `admin` de ambos locales y unir en la query.**
   - Pros: sin modelo de grupo.
   - Contras: "admin de los dos" no distingue dueño de un encargado promovido; difícil de gatear "sólo
     dueños"; no escala a "el socio ve, la encargada no". Descartado.

### Provisioning

1. **Dump/restore de toda la base del negocio plantilla.** — Copiaría datos operativos y secretos;
   peligroso. Descartado.
2. **Clonación por lista blanca de tablas de estructura.** *(elegida)* — Copia categorías, productos,
   stations, salones, mesas, branding; excluye explícitamente pedidos/cajas/comandas y **todas** las
   columnas de secreto. Determinístico y auditable.

### Impresión on-site

1. **El app imprime directo a la comandera (TCP/ESC-POS desde Next.js).** — Acopla el app a la red local
   y a hardware; imposible si el app corre fuera del servidor; mete drivers de impresora en el repo.
   Descartado.
2. **Agente de impresión local (infra) que hace *pull* de comandas `pendiente`, imprime por sector y
   confirma a la app.** *(elegida)* — El app sólo expone (a) el **contenido imprimible** por `station_id`
   y (b) la transición `pendiente → en_preparacion`. El agente vive **fuera del repo**, en el servidor
   on-site, en la LAN de las comanderas. Alineado con lo ya documentado en el código.

## Decisión

- **Grupo + consolidado acotado (Opción 2)**: tabla puente `business_groups` + `business_group_members`
  con `owner_user_id`. Nuevo helper `canViewConsolidado` en `src/lib/permissions/can.ts` que habilita
  **sólo** al owner del grupo (no encargado, no mozo, y distinto de `is_platform_admin`). El consolidado
  vive en `src/lib/platform/queries.ts`, reusando la agregación de `getPlatformOverview` pero scopeada
  por `group_id`.
- **Clonación por lista blanca (Opción 2 de provisioning)**: nueva variante en
  `src/lib/platform/actions.ts` que copia estructura no sensible y **nunca** secretos
  (`mp_access_token`, `mp_webhook_secret`, credenciales ARCA del cambio 13, Meta/WhatsApp) ni datos
  operativos.
- **Agente de impresión (Opción 2 de impresión)**: el app expone el contrato (imprimible + transición);
  el **print agent es infra, fuera del repo**. Se formaliza la transición `pendiente → en_preparacion`
  ya documentada.
- **Credenciales por negocio, nunca clonadas**: Meta/WhatsApp se suma a `businesses` en columnas
  server-only, igual que MP (`businesses.mp_access_token`) y ARCA (cambio 13). El **envío** de WhatsApp es
  el **cambio 15**.

## Impacto técnico

- **Límite app vs. infra (lo más importante de este diseño):**

  ```
  APP (este repo, Next.js + Supabase):
    - crear comanda + ruteo por sector (resolveStation / createComandasForItems)
    - exponer contenido imprimible por station_id (handler nuevo)
    - transición pendiente -> en_preparacion al confirmar el agente
    - consolidado por grupo (sólo dueños) + provisioning por clonación
    - almacenamiento server-only de Meta/WhatsApp por negocio

  INFRA / OPERACIÓN (fuera del repo):
    - print agent en el servidor local: pull de comandas, ESC/POS, mapeo impresora<->sector
    - exposición de puertos con credenciales + AnyDesk
    - comanderas (incl. WiFi) en la LAN del servidor (no internet)
    - alta de cuentas/números de Meta y WhatsApp por local (community manager)
  ```

- **Flujo de la comanda hasta la comandera (contrato):**

  ```
  mozo/encargado envía a sectores
        │  (app)
        ▼
  createComandasForItems → comandas status=pendiente (por station_id)
        │
        ▼  pull (LAN, infra)
  print agent lee comandas pendiente del negocio → imprime en la comandera del sector
        │
        ▼  confirma (app)
  comanda: pendiente → en_preparacion
        │
        ▼
  mozo levanta el plato → marcarComandaEntregada → entregado
  ```

- **Datos:** migración nueva `00NN_grupos_y_meta.sql` (número al implementar; última real `0051`):
  - `business_groups (id, name, owner_user_id)`, `business_group_members (group_id, business_id)`.
  - `businesses`: `whatsapp_phone text`, `meta_account_ref text`, `meta_api_token text` (server-only).
  - RLS: el consolidado por grupo lo lee el **owner** (y platform admin); las columnas de secreto de Meta
    no son legibles por roles no-admin. Policies plataforma siguiendo el patrón repetido de `0039`
    (toda tabla nueva con RLS por `is_business_member` necesita su set `platform_*` con
    `is_platform_admin()`).

- **Contratos entre módulos:**
  - `platform/queries.ts` (consolidado) **lee** `business_group_members` para acotar la agregación;
    **no** usa `getPlatformOverview` (alcance global) para el dueño.
  - `permissions/can.ts::canViewConsolidado` gatea la vista; el dueño del grupo ≠ platform admin.
  - `platform/actions.ts` (clonar) **lee** estructura del negocio plantilla y **escribe** el nuevo; nunca
    toca columnas de secreto.
  - `comandas` (handler de impresión) **expone** comandas por `station_id` y **acepta** la confirmación
    del agente para `pendiente → en_preparacion`. El agente (infra) es el único consumidor.
  - Meta/WhatsApp por negocio: este cambio **almacena**; el **cambio 15** **consume** para enviar.

- **Multi-tenant / RLS:**
  - El consolidado es la **única** lectura que cruza negocios, y sólo dentro del **grupo del dueño**;
    todo lo demás sigue scopeado por `business_id` (encargados/mozos no cambian).
  - La clonación crea un `business_id` nuevo, independiente; no comparte filas con el plantilla.
  - Cada local conserva su config fiscal (cambio 13), su MP y su Meta; el consolidado **suma** métricas,
    no mezcla numeraciones, cobros ni secretos.

## Trade-offs y consecuencias

- **Excepción consciente al "todo scopeado por tenant"**: el consolidado cruza negocios a propósito. Se
  acota fuerte (grupo + owner + RLS) y se cubre con tests de no-fuga (encargado no ve; dueño sólo su
  grupo).
- **Disciplina anti-clonado de secretos**: la seguridad de la duplicación depende de la lista blanca de
  estructura y de excluir columnas de secreto. Se verifica en la revisión fresca y con un test explícito
  de "Golf clonado tiene secretos vacíos".
- **App/infra acoplados por contrato, no por código**: si el print agent cambia de *pull* a *push*, el
  app sólo ajusta el handler, no su core. El binario del agente vive y versiona fuera del repo (deuda de
  documentación operativa, no de código).
- **Plan de reversión**: migración **aditiva** (tablas y columnas nuevas). Revertir el consolidado es
  ocultar la vista y el permiso; revertir la clonación es no ofrecer la variante (el `createBusiness`
  simple sigue intacto). Negocios ya creados/clonados y secretos ya cargados **no** se revierten (son
  datos reales por local). On-site: desconectar el agente no afecta el modelo de datos del app.
