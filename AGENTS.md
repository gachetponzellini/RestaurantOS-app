# AGENTS.md — RestaurantOS (Sistema de Pedidos)

> Contexto canónico del proyecto para agentes de IA (gentle-ai / SDD). Si un agente lee
> un solo archivo antes de trabajar, es éste. No inventes convenciones: lo que no esté
> acá, verificalo en el código antes de asumirlo.

---

## 1. Qué es

**RestaurantOS** (nombre interno del paquete: `pedidos`, dominio prod: `pedidos.com.ar`) es un
**SaaS multi-tenant de gestión integral para restaurantes**. Un mismo deploy sirve a múltiples
negocios; cada negocio tiene su carta digital pública, su operación de salón (mozos, comandas,
caja), su panel de administración, facturación, analítica y un chatbot de reservas.

**Cliente piloto:** complejo gastronómico con dos locales, **House** y **Golf** (cada local = un
`business` distinto). Vienen migrando de **MaxiRest** (POS legacy). Deploy **on-site** (servidor
local con comanderas/impresoras, acceso por AnyDesk). Go-live objetivo ~2 semanas; pendiente
clave la conexión con **ARCA** (facturación electrónica AR).

El backlog de cambios vigente sale de la **reunión de demo** documentada en
`../RestaurantOS_Reunion/Reunion_Demo_RestaurantOS.md` y está formalizado como cambios SDD en
[`openspec/changes/`](openspec/changes/README.md).

---

## 2. Stack

| Capa | Tecnología |
| --- | --- |
| Framework | **Next.js 15.5** (App Router, `--turbopack`), **React 19**, **TypeScript 5** |
| Datos / Auth | **Supabase** (Postgres + RLS, Auth SSR vía `@supabase/ssr`, Google OAuth en el dashboard de Supabase) |
| UI | **Tailwind v4**, **shadcn** (Radix + `@base-ui/react`), `lucide-react`, `sonner` (toasts), `recharts` (gráficos), `next-themes` (dark mode), `@dnd-kit` (floor plan) |
| Forms / validación | `react-hook-form` + **Zod 4** |
| Estado cliente | **Zustand** (`src/stores`) |
| Pagos | **Mercado Pago** SDK (`mercadopago`) — config **por negocio** en tabla `businesses` |
| Facturación AR | **AFIP/ARCA vía proveedor TusFacturas** (`src/lib/afip`) |
| Chatbot | **LangChain** (`@langchain/anthropic`, `@langchain/openai`) — agente de reservas |
| Rate limiting | **Upstash Redis** (opcional) en `createOrder` |
| Fechas | `date-fns` / `date-fns-tz` (timezone AR) |
| Testing | **Vitest 4** + Testing Library + jsdom |
| Tooling | pnpm, ESLint 9, Prettier, `tsx` (scripts/seeds), Supabase CLI |

Gestor de paquetes: **pnpm** (hay `pnpm-lock.yaml`). Scripts clave en `package.json`:
`dev`, `build`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `test:watch`,
`db:reset`, `db:types`, `db:push`, `seed:estructura`, `seed:operativo`.

---

## 3. Arquitectura

### Multi-tenancy
- Rutas bajo `src/app/[business_slug]/…`. En **prod** el slug se resuelve por **subdominio**
  (`house.pedidos.com.ar`), en **dev** por **path** (`localhost:3000/house`). El middleware decide.
- Capa de **plataforma** en `src/app/(platform)/negocios` + `src/lib/platform` (alta/gestión de
  negocios, admin de plataforma con impersonación — migraciones `0006`/`0007`).
- Casi todo dato está **scopeado por `business_id`** y protegido por **RLS** en Postgres.

### Patrón de módulo de dominio (`src/lib/<dominio>/`)
Convención consistente — respétala al agregar features:
- `actions.ts` → **Server Actions** (mutaciones). Validan input con Zod, chequean permisos, escriben en Supabase.
- `queries.ts` → lecturas (server).
- `types.ts` y/o `schema.ts` → tipos + esquemas Zod.
- archivos de lógica de dominio pura y testeable (ej. `state-machine.ts`, `routing.ts`,
  `expected-cash.ts`, `assign-table.ts`, `emit-invoice.ts`, `calculate-amounts.ts`).
- tests **co-ubicados**: `*.test.ts` (unidad) y `*.integration.test.ts` (integración).

### Rutas (App Router)
- `[business_slug]/(public)` → carta/menú, carrito, checkout, confirmación, reservar, perfil, login (cliente final).
- `[business_slug]/admin/(authed)` → panel de administración (dueño/encargado).
- `[business_slug]/mozo` y `…/mozo/mesa` → app del mozo.
- `[business_slug]/fichar` → fichaje de personal.
- `[business_slug]/demo` → modo demo.
- `src/app/api/…` → route handlers: `mp/webhook` (Mercado Pago), `billing/payment-status`,
  `caja/stats`, `chatbot/config`, `chatbot/test`, `stock/history`.

### Componentes
`src/components/admin/<área>` (campaigns, catalog, customers, daily-menus, dashboard, facturacion,
floor-plan, local, orders, promos, reports, rrhh, salones, settings, stock, users, …) y de cara al
público/operación: `menu`, `cart`, `checkout`, `delivery`, `mozo`, `fichar`, `reservations`,
`notifications`, `public`, `super` / `super-categories`, `ui` (primitivos shadcn), `shared`.

---

## 4. Datos (Supabase)

- Migraciones versionadas en `supabase/migrations/0001…0051_*.sql`. Snapshot en
  `supabase/schema.current.sql`. Semillas en `supabase/seed.sql` + `scripts/seed-*.ts`.
- **Toda feature de datos = nueva migración numerada** (`00NN_descripcion.sql`) con sus
  **policies RLS** (admin/plataforma) y, si cambia el schema TS, regenerar tipos
  (`pnpm db:types`, salida a `src/lib/supabase/database.types.ts`).
- Hitos de dominio ya migrados (referencia rápida): `0011` Mercado Pago, `0012-0016/0041` chatbot
  (+ reservas), `0017/0046` menú del día (+ componentes), `0018` promo codes, `0019` campañas,
  `0021` reservas, `0022/0023/0038` floor plan + dine-in + estados de mesa simplificados,
  `0025/0034` comandas (+ realtime), `0026` roles y estados post-decisiones, `0035` cuenta y splits,
  `0036/0043` pagos (+ transferencia), `0037/0044` caja (+ continua), `0042` prep time,
  `0045` RRHH, `0047` seat & method config, `0048` invoices (AFIP), `0049` stock,
  `0050/0051` recipes & costing (+ sub-recetas y descargo).

> Implicación clave: **el sistema ya está muy avanzado**. La mayoría de los ítems de la reunión son
> **refinamientos sobre módulos existentes**, no construcción desde cero. Antes de proponer, leé el
> módulo real (`actions.ts`/`queries.ts`/migración) que toca el cambio.

---

## 5. Convenciones

- **Idioma:** dominio y UI en **español (AR)**; código/identificadores en inglés salvo términos de
  dominio (`comanda`, `mozo`, `caja`, `mesa`, `salon`). Escenarios de specs en español, formato
  **Given/When/Then** (Dado/Cuando/Entonces).
- **Mutaciones = Server Actions** en `actions.ts`, nunca lógica de escritura en componentes cliente.
- **Validación con Zod** en el borde de toda action.
- **Permisos** centralizados en `src/lib/permissions` (`can.ts`). Roles: dueño/admin, **encargado**,
  **mozo**, personal. Ej.: anular mesa/producto es permiso de mostrador, no de mozo.
- **Dinero en centavos** (`*_cents`) y formateo con helpers (`src/lib/currency.ts`).
- **Timezone AR** siempre vía `date-fns-tz`; no usar `Date` naïve para lógica de turnos/caja.
- **Realtime** (Supabase channels) para pedidos en vivo, comandas y mesas del mozo.
- **No** romper RLS: las actions corren con el cliente server scopeado; nunca exponer
  `SUPABASE_SERVICE_ROLE_KEY` al cliente.

---

## 6. Testing & Strict TDD

- Runner: `pnpm test` (`vitest run`). Watch: `pnpm test:watch`. Hay **26 suites** hoy.
- Patrón: lógica de dominio pura testeada por unidad (ej. `mozo/state-machine.test.ts`,
  `caja/expected-cash.test.ts`, `afip/calculate-amounts.test.ts`, `orders/update-status.test.ts`);
  flujos con DB en `*.integration.test.ts`.
- **Strict TDD activado** para este repo (ver `openspec/config.yaml`): para lógica de negocio nueva,
  escribir/extender el test **antes** de la implementación. Todo cambio debe dejar
  `pnpm typecheck` y `pnpm test` en verde.

---

## 7. Integraciones (config y secretos)

- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` (server only). Google OAuth se configura en el **dashboard de Supabase**, no en env.
- **Mercado Pago:** **sin env vars** — credenciales **por negocio** en la tabla `businesses` (pantalla
  Config del admin). Webhook: `api/mp/webhook`. `NEXT_PUBLIC_SITE_URL` se usa para back_urls/webhook/OAuth.
- **AFIP/ARCA (TusFacturas):** `src/lib/afip` — `provider.ts`, `tusfacturas.ts`, `emit-invoice.ts`,
  `sandbox.ts`, `config-actions.ts`. Requiere **certificado + CUIT + punto de venta** por negocio.
- **Chatbot (LangChain):** requiere **API key de Anthropic** para que el agente de reservas responda.
- **Upstash Redis** (opcional): `UPSTASH_REDIS_REST_URL/TOKEN` → rate limit en `createOrder`
  (si faltan, pasa sin limitar).
- **Secretos:** nunca en chat ni en commits; al pedir output que pueda contenerlos, **enmascarar**.

---

## 8. Glosario de dominio

**comanda** = ticket de cocina · **comandera** = impresora de cocina por sector · **estación/sector**
(cocina, parrilla, fritera, postre y café) · **mozo** = camarero · **salón** = comedor · **mesa** ·
**caja** (principal / bar) · **arqueo / corte** = cierre y conteo de caja · **rendición** = liquidación
de fin de turno del mozo · **fichaje / fichar** = marcar entrada/salida · **encargado** = manager ·
**menú del día** / **sugerencias del día** · **guarnición** = acompañamiento (en este negocio se cobra
**aparte**, no incluida) · **merma** = pérdida/desperdicio de insumo · **cuenta** = factura de mesa ·
**propina** · **posnet** = terminal de tarjeta · **ARCA/AFIP** = organismo fiscal AR · **CUIT** ·
**punto de venta** · **MaxiRest** = POS legacy que se reemplaza · **House / Golf** = los dos locales.

---

## 9. Cómo trabajar (gentle-ai / SDD)

Este repo usa el flujo **Spec-Driven Development** de gentle-ai. Para una feature mediana/grande:
1. **Explore** — leé este AGENTS.md, `openspec/config.yaml` y el módulo real afectado. Recuperá
   memoria previa si está disponible.
2. **Propose / Spec** — el cambio vive en `openspec/changes/<id>/` con `proposal.md` + `spec.md`
   (+ `design.md` si hay riesgo arquitectónico) + `tasks.md`. No escribas código de producción hasta
   tener el contrato aprobado (Approval Gate).
3. **Apply** — implementá siguiendo los patrones de §3/§5, en TDD (§6).
4. **Verify** — `pnpm typecheck` + `pnpm test` en verde; revisión fresca antes de PR.
5. **Archive** — al terminar, el cambio se marca como aplicado en el índice.

Reglas de delegación (mantener el thread fino): si leés 4+ archivos para entender un flujo, o tocás
2+ archivos no triviales, delegá exploración/escritura o pedí revisión fresca antes de cerrar.

---

## 10. Backlog actual (resumen)

El trabajo pendiente de la reunión está en **16 cambios SDD** →
[`openspec/changes/README.md`](openspec/changes/README.md). Highlights: carta (bebidas en slide,
sugerencias delivery/salón), reservas (asignar mesa), envío **bonificado**, mozo (guarniciones
**aparte**, platos elaborados solo observación), **colapso de estados** + auto-march a cocina,
**propina fuera de lo facturable**, **rendición de mozos**, **caja de bar** (venta directa, no manda
a comanda), **pedido flash** por monto, **stock & costeo**, fichaje solo desde PCs del local,
**proveedores** (módulo nuevo), **ARCA**, **multi-local House/Golf** + deploy on-site, chatbot
(API key) + **notificaciones WhatsApp**, campañas + ajustes de analítica.
