# Cambios SDD — RestaurantOS

> Índice de los cambios Spec-Driven (gentle-ai) que formalizan el backlog de la
> [reunión de demo](../../../RestaurantOS_Reunion/Reunion_Demo_RestaurantOS.md). Cada cambio vive en
> `openspec/changes/<NN-id>/` y es **additive**: propone un contrato (proposal + spec + tasks, y
> design si aplica) **antes** de tocar código de producción (Approval Gate, ver
> [`../config.yaml`](../config.yaml)).

---

## Cómo leer / usar un cambio

Un cambio = una carpeta `NN-id/` con:

| Archivo | Siempre | Qué contiene |
| --- | --- | --- |
| `proposal.md` | sí | por qué, qué cambia, alcance, impacto en archivos/migraciones reales, riesgos, preguntas |
| `spec.md` | sí | requisitos verificables con escenarios **Dado/Cuando/Entonces** (marcadores ADDED/MODIFIED/REMOVED) |
| `tasks.md` | sí | checklist TDD ordenada (test → impl → verify), incluye migración+RLS+tipos si toca datos |
| `design.md` | sólo si gate | decisiones de arquitectura cuando hay riesgo (estados, dinero, cross-módulo, multi-tenant) |

**Antes de implementar** cualquiera: leé [`../../AGENTS.md`](../../AGENTS.md) + [`../config.yaml`](../config.yaml)
+ el **módulo real** que toca el cambio (no asumir paths). El sistema ya está muy avanzado
(migraciones `0001–0051`): casi todo es **refinamiento**, no greenfield.

**Estados de un cambio:** `📋 propuesto` (spec lista, sin código) · `🚧 en progreso` · `✅ aplicado`.
Hoy **todos están 📋 propuesto**.

---

## Índice (16 cambios)

Ordenados por prioridad sugerida: primero el flujo cliente→salón→caja (núcleo diario), luego
back-office, luego lo que destraba go-live (ARCA, multi-local), luego crecimiento.

| NN | Cambio | Qué resuelve (resumen reunión) | Módulos reales | Design |
| --- | --- | --- | --- | --- |
| 01 | [`carta-digital-cliente`](01-carta-digital-cliente/) | bebidas en un slide; sugerencias del día delivery≠salón; bug pantalla efectivo; dark mode menú | `src/app/[business_slug]/(public)`, `components/menu`, `lib/daily-menus` | — |
| 02 | [`reservas-asignacion-mesa`](02-reservas-asignacion-mesa/) | asignar mesa a la reserva desde gestión (la nota del cliente → mesa) | `lib/reservations/assign-table.ts` `availability.ts` `booking-actions.ts`, `components/admin/reservations` | — |
| 03 | [`checkout-envio-y-pagos-cliente`](03-checkout-envio-y-pagos-cliente/) | envío **bonificado** (no $0); cupón auto-aplicado; token MP; estado de pago en delivery | `lib/payments/mercadopago.ts`, `components/checkout`, `lib/orders` | — |
| 04 | [`mozo-guarniciones-y-platos`](04-mozo-guarniciones-y-platos/) | guarnición **aparte** (producto individual); platos elaborados sólo observación; parrilla 3 puntos | `components/mozo`, `lib/mozo/state-machine.ts`, catálogo/adicionales | — |
| 05 | [`estados-pedido-y-comandas`](05-estados-pedido-y-comandas/) | colapsar estados (sacar "Empezar"); auto-march online→cocina; sin aviso "listo para servir" | `lib/orders/{status,status-meta,update-status}.ts`, `lib/comandas/{routing,route-items}.ts`, `lib/mozo/state-machine.ts` | **sí** |
| 06 | [`cobro-y-propina`](06-cobro-y-propina/) | propina **fuera del total facturable**; sacar "+10%" tarjeta; reubicar link MP; cortesía; split | `lib/payments`, `lib/caja`, `components/mozo`, cuenta/splits (`0035`) | **sí** |
| 07 | [`caja-rendicion-mozos`](07-caja-rendicion-mozos/) | pestaña **rendición de mozo** (billetera personal, cierre de turno); asignar cajas a usuario | `lib/caja/{expected-cash,actions}.ts`, `components/admin/caja` | — |
| 08 | [`caja-bar-venta-directa`](08-caja-bar-venta-directa/) | barra vende directo (mesa "bar", sin mozo); **no manda a comanda** salvo sanguchería | `lib/comandas/routing.ts`, `lib/caja`, salón/mesas | — |
| 09 | [`pedido-flash-y-anulacion-factura`](09-pedido-flash-y-anulacion-factura/) | facturar evento por **monto sin desglose** (producto ficticio); anular con motivo + re-facturar | `lib/afip/emit-invoice.ts`, `lib/orders`, catálogo | — |
| 10 | [`stock-y-costeo`](10-stock-y-costeo/) | extender stock al **bar** (agregar/quitar flexible); costeo por producto; merma estimativa | `lib/stock/actions.ts`, recetas/costeo (`0050/0051`), `api/stock/history` | — |
| 11 | [`fichaje-asistencia-onsite`](11-fichaje-asistencia-onsite/) | fichaje **sólo desde PCs del local**; sacar propinas del panel | `lib/rrhh/clock-actions.ts`, `components/fichar`, `lib/permissions` | — |
| 12 | [`proveedores`](12-proveedores/) | **módulo nuevo**: foto de factura → carga; estadística proveedor↔salida de productos | `src/lib/proveedores` (nuevo), migración nueva, `components/admin` | — |
| 13 | [`facturacion-arca-afip`](13-facturacion-arca-afip/) | conectar **ARCA** (cert + CUIT + punto de venta por negocio); sandbox→prod; bloqueante go-live | `lib/afip/{provider,tusfacturas,emit-invoice,sandbox,config-actions,calculate-amounts}.ts` | **sí** |
| 14 | [`multi-local-y-deploy-onsite`](14-multi-local-y-deploy-onsite/) | duplicar House+Golf; agente on-site + comanderas; **panel consolidado** sólo dueños | `lib/platform`, `app/(platform)/negocios`, comandas/impresión, permisos | **sí** |
| 15 | [`chatbot-y-notificaciones-whatsapp`](15-chatbot-y-notificaciones-whatsapp/) | cargar **API key Anthropic**; notificaciones WhatsApp **configurables** (quién recibe qué) | `lib/chatbot/agent.ts`, `api/chatbot/*`, `components/notifications` | — |
| 16 | [`campanas-y-analitica`](16-campanas-y-analitica/) | módulo campañas; analítica **filtrable por período**; sacar propina; stats a medida | `components/admin/{campaigns,reports}`, migración `0019`, analítica | — |

**Trazabilidad:** la columna "Qué resuelve" mapea a la §4 y §7 de la reunión. Cada `proposal.md`
debe citar la sub-sección concreta (ej. "Reunión §4 · App del Mozo" / "§7.5").

---

## Plantilla canónica

Las sub-secciones siguientes son el **molde exacto** para los cuatro archivos. Mantené los encabezados;
reemplazá el contenido entre `<…>`. Español (AR), escenarios en **Dado/Cuando/Entonces**, paths reales.

### `proposal.md`

```markdown
# <NN-id> — <Título legible>

> Estado: 📋 propuesto · Origen: Reunión §<n.n> (<módulo>) · Design: <sí/no>

## Por qué
<Problema u oportunidad. Cita la decisión de la reunión. 2–5 frases.>

## Qué cambia
<Lista concreta de lo que cambia en comportamiento/datos/UI. Bullets.>

## Alcance
**Incluye:**
- <…>

**No incluye (fuera de alcance):**
- <…  (ej. el mapa-pick de mesa queda como futuro)>

## Impacto
- **Archivos** (reales): `src/lib/<dominio>/actions.ts`, `components/<área>/…`, …
- **Datos:** <nueva migración `00NN_*.sql` + policies RLS / sin cambios de schema>
- **Tipos:** <regenerar `pnpm db:types` / n/a>
- **Permisos:** <cambios en `lib/permissions/can.ts` / n/a>
- **Integraciones:** <MP / ARCA / WhatsApp / Anthropic / n/a>

## Riesgos
- <riesgo → mitigación>

## Preguntas abiertas
- [ ] <pregunta para el cliente/dueño antes de implementar>
```

### `spec.md`

```markdown
# Spec — <NN-id> <Título>

> Requisitos verificables. Marcadores: `## ADDED` (nuevo), `## MODIFIED` (cambia comportamiento
> actual), `## REMOVED` (se elimina). Cada requisito ≥1 escenario Dado/Cuando/Entonces.

## ADDED Requirements

### Requisito: <nombre en infinitivo, ej. "Mostrar envío bonificado">
<1 frase normativa: el sistema DEBE …>

#### Escenario: <caso feliz>
- **Dado** <contexto / estado / rol>
- **Cuando** <acción>
- **Entonces** <resultado observable y verificable>

#### Escenario: <borde / error / permiso>
- **Dado** …
- **Cuando** …
- **Entonces** …

## MODIFIED Requirements

### Requisito: <…>
<qué pasa a ser distinto vs. el comportamiento de hoy>

#### Escenario: …

## REMOVED Requirements

### Requisito: <…>
<qué se elimina y por qué (ej. estado "Empezar")>
```

### `tasks.md`

```markdown
# Tareas — <NN-id> <Título>

> TDD: primero el test que falla, luego implementación, luego verify. Checklist chica y ordenada.

## 1. Datos (si aplica)
- [ ] Migración `supabase/migrations/00NN_<desc>.sql` + policies RLS (admin/plataforma, scope business_id)
- [ ] `pnpm db:types` → `src/lib/supabase/database.types.ts`

## 2. Dominio (TDD)
- [ ] Test (rojo): `src/lib/<dominio>/<archivo>.test.ts` cubriendo los escenarios del spec
- [ ] Implementar lógica pura en `src/lib/<dominio>/<archivo>.ts`
- [ ] Server Action en `actions.ts` (validación Zod, permisos `can.ts`)

## 3. UI
- [ ] `components/<área>/…` consumiendo la action/query

## 4. Verify
- [ ] `pnpm typecheck` y `pnpm test` en verde
- [ ] Revisión fresca de archivos tocados
- [ ] Marcar ✅ en `openspec/changes/README.md`
```

### `design.md` (sólo si lo pide un gate)

```markdown
# Design — <NN-id> <Título>

## Contexto y problema
<por qué necesita diseño: máquina de estados / dinero / cross-módulo / multi-tenant>

## Opciones consideradas
1. **<Opción A>** — pros / contras
2. **<Opción B>** — pros / contras

## Decisión
<la elegida y por qué>

## Impacto técnico
- **Máquina de estados:** <diagrama textual de estados/transiciones antes→después>
- **Datos:** <migración/policies>
- **Contratos entre módulos:** <quién llama a quién>
- **Multi-tenant / RLS:** <cómo se mantiene el scope>

## Trade-offs y consecuencias
<qué resignamos, deuda asumida, plan de reversión>
```

---

## Coordinación entre cambios

Dependencias y reglas transversales que surgieron al especificar (leelas antes de implementar en orden):

- **Propina por fuera** (regla transversal): `06` la saca del facturable/caja; `16` la saca de las
  métricas; `11` la saca del panel de fichaje. Implementar `06` primero fija el contrato.
- **Estado de pago → auto-march:** `03` agrega el indicador "pagado / paga en efectivo" en el pedido de
  delivery; `05` lo consume para mandar a cocina automáticamente. `03` antes que `05`.
- **Anulación ↔ nota de crédito:** `09` (anular factura con motivo + re-facturar) necesita la emisión de
  **NC** que define `13` (ARCA). Coordinar el contrato de NC entre ambos.
- **Ruteo de comanda del bar:** `08` introduce "la barra no manda a comanda salvo sectores que expiden"
  con lógica nueva (`bar-routing`) **sin** tocar el ruteo de `05`. Verificar que no se pisen.
- **Proveedor ↔ salida de productos:** `12` crea el vínculo proveedor↔insumo y la query base; `16` arma el
  reporte cruzado a medida. `12` antes que ese reporte de `16`.
- **Import masivo:** `10` (insumos) y `12` (proveedores) comparten patrón de importador desde Excel de
  MaxiRest — reusar la misma convención (upsert idempotente, filas con error reportadas sin abortar).
- **On-site:** `11` (fichaje sólo desde el local, allowlist IP/red) depende del proxy/red on-site que
  describe `14`. Coordinar cómo llega la IP real (`x-forwarded-for`) detrás del proxy local.
- **Credenciales por negocio:** `13` (ARCA) y `14` (multi-local) comparten el principio de mover secretos
  de env global a **config por negocio** (tabla `businesses`, server-only). Hallazgo: hoy `tusfacturas.ts`
  lee la API key de env global — House/Golf necesitan CUIT/punto de venta distintos.

**Numeración de migraciones:** la última migración real es **`0051`**. Varios cambios proponen una
migración nueva; los specs la nombran `0052_*` o `00NN_*` como **placeholder**. El número definitivo es
secuencial y se asigna **al implementar** — no pueden coexistir dos `0052`. Al aplicar cambios en orden,
**renumerar** cada migración a la siguiente libre.

---

## Convenciones recordatorio

- **No inventes paths.** Si no estás seguro de un archivo, abrilo antes de citarlo.
- **Dinero en centavos**, **timezone AR**, **scope `business_id` + RLS** en todo lo que toque datos.
- **Propina por fuera** de lo facturable y de métricas (regla transversal: afecta 05/06/11/16).
- **Secretos**: jamás en specs/chat/commits; al pedir output que pueda contenerlos, enmascarar.
