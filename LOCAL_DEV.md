# Estrategia de entornos — local vs cloud

Cómo desarrollar contra una **copia local** de la base (rápida) sin perder de
vista que **producción es el cloud** (fuente de verdad). Pensado para switchear
entre los dos con un comando y sin romper nada.

---

## TL;DR

```bash
pnpm dev:cloud   # desarrollar contra PRODUCCIÓN (la DB real, lento desde AR)
pnpm dev:local   # desarrollar contra una COPIA local (rápido)
```

- **Cloud** = producción. Fuente de verdad. Se administra **solo por el MCP de Supabase**.
- **Local** = copia para dev. El **esquema** y la **data** se **traen del cloud**.
- Cambiar de entorno = cambiar 3 variables en `.env.local` (lo hace el switch solo).

---

## El modelo mental

| | **Cloud** (producción) | **Local** (dev) |
|---|---|---|
| Qué es | La base real, viva | Una copia en tu máquina (Docker) |
| Para qué | Producción / staging | Desarrollar rápido (round-trips ~1-5ms vs ~600ms) |
| Fuente de verdad | **Sí** | No — es desechable, se re-arma del cloud |
| Cómo se cambia el esquema | **MCP de Supabase** (`apply_migration`) | Se baja del cloud (dump) |
| Datos | Reales | Copia del cloud (`db:clone`) o seed demo |
| URL | `tjfufswzsxfujcpoxapx.supabase.co` | `127.0.0.1:54321` |

**Regla mental:** todo cambio real (esquema, config de negocios) se hace en el
**cloud vía MCP**. El local solo *consume* del cloud. Nunca al revés.

---

## 1. Switch de entorno (`.env.local`)

Next lee `.env.local`. Entre local y cloud **solo cambian 3 variables** de Supabase
(URL + publishable key + service role); todo lo demás (Google, Anthropic, ROOT_DOMAIN…)
queda igual.

- **`.env.cloud`** — snapshot de las vars de **producción** (gitignored, se creó solo la 1ª vez). `env:cloud` siempre restaura de acá → las creds de prod **no se pierden nunca**.
- **local** — se leen en vivo de `supabase status` (no se guardan en archivo).

```bash
pnpm env:cloud   # .env.local → producción
pnpm env:local   # .env.local → stack local (requiere supa:start)
```

`dev:cloud` / `dev:local` hacen el switch + `next dev` de una.

---

## 2. El esquema del local sale del CLOUD, no de las migraciones ⚠️

`supabase db reset` **no funciona** en este repo: `supabase/migrations/` divergió
del cloud (varias migraciones se aplicaron por MCP y nunca se guardaron como
archivo — `business_groups`, `rls_auto_enable`, split de `0072`, numeración
duplicada `0057`/`0068`…). Reconstruir desde esos archivos rompe.

**Por eso el esquema local se baja de un dump del cloud** (la fuente de verdad):

```bash
pnpm db:reset-local   # aplica el esquema de prod al local (usa el dump cacheado)
pnpm db:pull-schema   # re-baja el esquema del cloud y lo aplica
```

El dump vive en `supabase/.clone/cloud_schema.sql` (gitignored). Postgres 17 local =
Postgres 17 prod → esquema idéntico.

> Arreglar el drift de los archivos de migración (re-sincronizarlos con el cloud)
> es **deuda técnica aparte**. Hasta entonces, el flujo de arriba es el camino.

---

## 3. La data del local: copia exacta o seed demo

**Opción A — copia exacta del cloud (la que usamos):** local = prod, con los
negocios reales y su config (MP, ARCA, etc.).

```bash
pnpm db:clone   # esquema + TODA la data real del cloud (limpia el local y copia)
```

⚠️ Copia data **real**: clientes (PII) + **secretos por negocio** (tokens MP, certs
ARCA, keys del chatbot). Queda en `supabase/.clone/` (gitignored). Úsalo a conciencia.

**Opción B — seed demo (sin secretos):** negocios House/Golf ficticios.

```bash
pnpm setup:local   # esquema del cloud + tipos + seed demo (estructura + operativo)
```

---

## 4. Login en local

El admin / super admin entra por **email + password** (`signInWithPassword`). El
Google OAuth es **solo para la carta pública** (clientes).

- Tu cuenta real (`juancruzbonadeo04@gmail.com`) es platform admin en el cloud, así
  que con `db:clone` viene incluida — pero como es de **Google, no tiene password**.
  Se la seteás:
  ```bash
  pnpm local:login juancruzbonadeo04@gmail.com Juan2004
  ```
- Con seed demo: el equipo (`admin@demo.test`, `sofia@demo.test`, …) entra con `demo1234`.
- Crear un super admin nuevo desde cero: `pnpm local:superadmin <email> <pass>`.

---

## Comandos (referencia)

| Comando | Qué hace |
|---|---|
| `pnpm dev:cloud` | env → cloud + `next dev` (producción) |
| `pnpm dev:local` | `supabase start` + env → local + `next dev` |
| `pnpm supa:start` / `supa:stop` / `supa:status` | manejar el stack local (Docker) |
| `pnpm env:cloud` / `env:local` | solo switchear el `.env.local` |
| `pnpm db:pull-schema` | re-bajar el esquema del cloud y aplicarlo al local |
| `pnpm db:reset-local` | re-aplicar el esquema (dump cacheado) al local |
| `pnpm db:clone` | **copia exacta** del cloud (esquema + toda la data) |
| `pnpm setup:local` | local listo con **seed demo** (sin secretos) |
| `pnpm local:login <email> [pass]` | setear password a un usuario del auth local |
| `pnpm local:superadmin <email> <pass>` | crear/actualizar usuario + marcarlo platform admin |
| `pnpm db:types:local` | regenerar tipos TS desde el **local** (`db:types` apunta al cloud) |

---

## Flujos típicos

**Día a día (ya configurado):**
```bash
pnpm dev:local        # laburar rápido contra la copia local
pnpm dev:cloud        # volver a producción cuando haga falta
```

**Refrescar el local con lo último de prod:**
```bash
pnpm db:clone
pnpm local:login juancruzbonadeo04@gmail.com Juan2004   # re-poner password (la copia la borra)
```

**Desde cero en una máquina nueva** (con Docker Desktop abierto):
```bash
pnpm supa:start
pnpm db:clone                                            # o: pnpm setup:local (demo)
pnpm local:login juancruzbonadeo04@gmail.com Juan2004
pnpm dev:local
```

---

## Reglas de oro

1. **Producción se toca solo por el MCP de Supabase.** Nunca `supabase db push` /
   `pnpm db:push` contra el cloud (intentaría re-aplicar migraciones ya aplicadas).
2. **El esquema local se baja del cloud**, no de `db reset` (migraciones drifteadas).
3. **`db:clone` baja secretos reales** a tu disco (gitignored). Tenelo presente.
4. **Tipos:** en local `db:types:local`; `db:types` apunta al cloud.
5. **Volver a prod** antes de cualquier cosa que dependa de la data real: `pnpm dev:cloud`.

---

## Deuda conocida

- **Migraciones drifteadas:** `supabase/migrations/` no reconstruye prod. Fix futuro:
  re-sincronizar los archivos con el historial del cloud (`schema_migrations`) o
  baselinear. Mientras tanto, el esquema local se arma del dump (sección 2).
- **`seed:estructura`** falla en la fase "Daily Menus" (bug del seed, no del esquema).
  `setup:local` lo tolera y sigue; el resto del seed queda OK.
