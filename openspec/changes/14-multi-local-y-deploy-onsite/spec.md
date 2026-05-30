# Spec — 14-multi-local-y-deploy-onsite Multi-local, deploy on-site y panel consolidado (sólo dueños)

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.
> Scope **business_id + RLS**; el consolidado es la **única** excepción y sólo para dueños del grupo.
> Dinero en **centavos**; secretos por negocio, **server-only**, jamás clonados ni expuestos.

## ADDED Requirements

### Requisito: Agrupar locales de un mismo dueño (grupo de negocios)

El sistema DEBE modelar un **grupo de negocios** que vincula los locales de un mismo dueño (ej. House y
Golf) e identifica al **dueño/owner** del grupo, de forma que el consolidado pueda acotarse a ese grupo
sin exponer otros negocios de la plataforma.

#### Escenario: Dos locales pertenecen al mismo grupo

- **Dado** los negocios "House" y "Golf" y un owner "Martín"
- **Cuando** se crea el grupo "Complejo" con House y Golf y owner Martín
- **Entonces** el grupo queda persistido con ambos locales como miembros y Martín como owner, scopeado
  por RLS

#### Escenario: Un negocio de otro dueño no entra al grupo

- **Dado** un negocio "Kentucky" de otro dueño
- **Cuando** se consulta el grupo "Complejo"
- **Entonces** "Kentucky" no aparece entre los miembros del grupo

### Requisito: Ver el panel consolidado sólo los dueños del grupo

El sistema DEBE permitir el **panel consolidado** (métricas agregadas de los locales del grupo) **sólo**
al dueño del grupo. Encargados, mozos y personal NO pueden verlo; cada uno sigue scopeado a su
`business_id`.

#### Escenario: El dueño ve el consolidado de sus locales

- **Dado** Martín, owner del grupo "Complejo" (House + Golf)
- **Cuando** abre el panel consolidado
- **Entonces** ve métricas agregadas (ventas, pedidos, etc.) de **House y Golf** sumadas, en centavos, y
  no ve datos de negocios fuera de su grupo

#### Escenario: El encargado no accede al consolidado

- **Dado** Rocío, con rol `encargado` en "House"
- **Cuando** intenta abrir el panel consolidado
- **Entonces** el acceso se deniega (gate `canViewConsolidado` = sólo dueño del grupo); Rocío sigue
  viendo únicamente el panel de "House"

#### Escenario: El consolidado no mezcla negocios ajenos

- **Dado** un platform admin del equipo dev (que sí ve **todos** los negocios vía `getPlatformOverview`)
- **Cuando** Martín abre **su** consolidado
- **Entonces** el consolidado de Martín agrega **sólo** los locales de su grupo, nunca todos los negocios
  de la plataforma

### Requisito: Provisionar un local nuevo clonando estructura (sin datos ni secretos)

El sistema DEBE permitir crear un negocio nuevo a partir de un negocio plantilla, copiando su
**estructura** (categorías, productos, stations/sectores, salones, mesas, branding no sensible) y **NO**
copiando datos operativos (pedidos, cajas, comandas) ni **secretos** (MP, ARCA, Meta/WhatsApp).

#### Escenario: Duplicar House para crear Golf

- **Dado** "House" con su catálogo, sectores, salones y mesas cargados
- **Cuando** se provisiona "Golf" clonando desde "House"
- **Entonces** "Golf" queda con la misma estructura (categorías/productos/stations/salones/mesas), sin
  pedidos ni cajas, y **sin** ninguna credencial de MP/ARCA/Meta heredada

#### Escenario: La clonación no copia secretos

- **Dado** "House" con `mp_access_token`, credenciales ARCA y Meta/WhatsApp cargadas
- **Cuando** se clona a "Golf"
- **Entonces** las columnas de secreto de "Golf" quedan **vacías** y deben cargarse manualmente por local

#### Escenario: Sólo plataforma/owner provisiona

- **Dado** un usuario con rol `encargado`
- **Cuando** intenta provisionar un local nuevo
- **Entonces** la action lo rechaza (provisioning reservado a platform admin / owner del grupo)

### Requisito: Configurar Meta/WhatsApp por negocio de forma segura

El sistema DEBE permitir cargar el **número de WhatsApp** y las **credenciales de Meta** **por
`business_id`**, en almacenamiento **server-only**, sin exponerlas al cliente ni a roles no-admin. (El
**envío** de mensajes es el cambio 15; acá sólo el almacenamiento seguro por negocio.)

#### Escenario: Cada local tiene su número y cuenta de Meta

- **Dado** "House" y "Golf"
- **Cuando** el admin de cada local carga su número de WhatsApp y credenciales de Meta
- **Entonces** cada negocio persiste lo suyo en columnas server-only de `businesses`, independiente del
  otro local

#### Escenario: El secreto de Meta nunca se expone en la UI

- **Dado** "Golf" con credenciales de Meta cargadas
- **Cuando** el admin abre la pantalla de configuración
- **Entonces** la UI muestra "WhatsApp conectado: sí" pero no renderiza el token (la query selecciona un
  flag, nunca el secreto)

### Requisito: Exponer el contrato de impresión de comandas para el agente on-site

El sistema (app Next.js) DEBE exponer el **contenido imprimible** de una comanda y la transición
`pendiente → en_preparacion` que el **agente de impresión local** confirma al imprimir. La app **no**
habla directamente con la impresora; el agente (infra on-site) hace de puente con la comandera en la red
local.

#### Escenario: El agente toma una comanda pendiente y confirma impresión

- **Dado** una comanda en estado `pendiente` (todavía no impresa) en "House"
- **Cuando** el agente local la imprime en la comandera del sector y confirma a la app
- **Entonces** la comanda pasa a `en_preparacion` (la transición que hoy "dispara la impresora térmica",
  documentada en `src/lib/comandas/types.ts`/`actions.ts`), scopeada por `business_id`

#### Escenario: La impresión respeta el ruteo por sector

- **Dado** una orden con ítems de cocina y de parrilla
- **Cuando** se generan las comandas (`createComandasForItems`, `resolveStation`)
- **Entonces** cada comanda imprimible queda asociada a su `station_id`, para que el agente la envíe a la
  comandera correcta (mapeo impresora↔sector es config de infra, fuera de la app)

## MODIFIED Requirements

### Requisito: Crear negocio (`createBusiness`)

Cambia respecto de hoy: además del alta básica (slug, name, timezone, invitar admin) que ya hace
`src/lib/platform/actions.ts`, se agrega la variante **clonar desde un negocio plantilla** (estructura no
sensible, sin secretos). El gate sigue siendo platform admin; se admite además el **owner del grupo**
para sus locales. Se mantiene la idempotencia de la invitación del admin.

#### Escenario: Alta simple sigue funcionando

- **Dado** un platform admin
- **Cuando** crea un negocio sin plantilla (como hoy)
- **Entonces** el negocio se crea con sus defaults y se invita al admin, sin cambios respecto del
  comportamiento actual

### Requisito: Panel de plataforma / consolidado (`getPlatformOverview`)

Cambia respecto de hoy: el consolidado deja de ser **exclusivo** del platform admin sobre **todos** los
negocios. Se mantiene `getPlatformOverview` para el equipo dev, y se agrega un consolidado **acotado al
grupo** para el **dueño** (reusando el patrón de agregación, scopeado por `group_id`).

#### Escenario: Platform admin sigue viendo todo

- **Dado** un platform admin del equipo dev
- **Cuando** abre `/(platform)`
- **Entonces** sigue viendo el overview de **todos** los negocios (sin cambios), distinto del consolidado
  acotado del dueño
