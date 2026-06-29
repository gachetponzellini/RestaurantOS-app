# Runbook — Baseline de migraciones (reset del drift local ↔ cloud)

> **Objetivo:** dejar local y cloud con **una sola migración base** y el historial
> alineado, para que vuelvan a andar los 3 comandos estándar (`migration new` →
> `db reset` → `db push` → `gen types`). One-time. Después de esto, el flujo es trivial.

## Por qué (el drift actual)

- Archivos locales: `0001…0085` (con **duplicados** `0057_*`×2, `0068_*`×2; huecos `0062/0075/0082`).
- Historial del **cloud**: `0001–0055` como `00NN` + **26 versiones timestamp** (`20260609…20260619`) que son los cambios 0056–0078 aplicados con otra etiqueta. Le **faltan** 0079–0085.
- Varias migraciones **no idempotentes** (`add column` sin `if not exists`) + un **0075 fantasma** (en cloud, sin archivo).

Reconciliar archivo-por-archivo pisa todas esas minas. **Squash** (aplastar a 1 base) las neutraliza: archivás los 85 → no más duplicados/no-idempotencia; reseteás el historial → no más fantasma/timestamps.

## Orden seguro

El único paso irreversible-ish del **cloud** (reset de historial) va **al final**, recién cuando el baseline ya se probó en local. Antes de eso, lo único que se toca del cloud son las migraciones additive que igual queríamos publicar.

> Leyenda: 🟦 = lo hace Claude por **MCP** · 🟩 = lo corre Juan por **CLI** (y pega salida).

---

### Paso 0 — Prerequisitos

- 🟩 MCP de Supabase conectado al proyecto (server HTTP `mcp__supabase__*`):
  ```bash
  claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=tjfufswzsxfujcpoxapx"
  ```
  Luego `/mcp` → supabase → **Authenticate** (OAuth). Si hace falta reiniciar la sesión para que carguen los tools, este runbook tiene todo para retomar.
- 🟩 CLI conectada (ya andan `supabase migration list` / `db push --dry-run`).

### Paso 1 — Backup (red de seguridad) 🟩
```bash
cd code/RestaurantOS
mkdir -p backups
supabase db dump --linked -f backups/pre-baseline-schema.sql        # esquema
supabase db dump --linked --data-only -f backups/pre-baseline-data.sql   # datos (opcional; ya hay PITR)
```
Guardá esos archivos. El cloud además tiene PITR en el dashboard.

### Paso 2 — Publicar 0079–0085 al cloud 🟦 (MCP `apply_migration`)
En orden, el contenido de cada archivo de `supabase/migrations/`:
`0079_daily_menu_choice_upcharge` · `0080_orders_scheduled_at` · `0081_orders_march_scheduled_cron` · `0083_comandas_print_failed_at` · `0084_cancelled_by` · `0085_shift_summary_cron`.
Son additive; los `cron.schedule` quedan **dormidos** hasta setear las GUCs (ver Paso 6). Tras esto el **esquema del cloud = completo**.

### Paso 3 — Generar el baseline desde el cloud 🟩
```bash
# 3a. archivar TODOS los originales primero (NO borrar: mover)
mkdir -p supabase/migrations_archive
git mv supabase/migrations/*.sql supabase/migrations_archive/
# 3b. con el dir vacío, dumpear el esquema completo del cloud como única base
supabase db dump --linked -f supabase/migrations/0001_baseline.sql
```
> Resultado: `supabase/migrations/` contiene **únicamente** `0001_baseline.sql`. Todo lo viejo queda en `migrations_archive/` como referencia.

### Paso 4 — Probar el baseline EN LOCAL (reversible) 🟩
```bash
supabase db reset            # reconstruye el LOCAL desde 0001_baseline.sql + seed
pnpm db:types:local          # regenera tipos desde el local
pnpm typecheck && pnpm exec vitest run --pool=threads src/lib/reports src/lib/email
```
- ✅ Si `db reset` corre limpio y los tests pasan → el baseline reproduce el esquema. Seguir.
- ❌ Si falla → el dump necesita ajuste. **Frenar**: el cloud sigue intacto (solo se le aplicó lo additive del Paso 2, que igual queríamos). Diagnosticar el dump antes de tocar el historial del cloud.

### Paso 5 — Resetear el historial del cloud 🟦 (MCP `execute_sql`) — IRREVERSIBLE-ish, va último
```sql
delete from supabase_migrations.schema_migrations;
insert into supabase_migrations.schema_migrations (version, name)
values ('0001', 'baseline');
```
Solo bookkeeping — no toca esquema ni datos. Verificar:
```bash
supabase migration list      # esperado: Local 0001 | Remote 0001 (alineado)
supabase db push             # esperado: "Remote database is up to date"
supabase db diff --linked    # esperado: vacío (sin drift)
```

### Paso 6 — Cerrar 🟩
```bash
supabase gen types typescript --linked > src/lib/supabase/database.types.ts
pnpm typecheck
```
- (Opcional, para que el cron de diferidos/cierre dispare) setear las GUCs una vez:
  ```sql
  alter database postgres set app.settings.cron_base_url = 'https://pedidos.com.ar';
  alter database postgres set app.settings.cron_secret   = '<mismo valor que CRON_SECRET del env>';
  ```
- Commit del submódulo (baseline + archive + tipos) + bump del puntero del brain.

---

## El flujo de acá en adelante (lo simple)

```bash
supabase migration new mi_cambio     # escribís el SQL
supabase db reset                    # rebuild LOCAL desde migraciones + seed
supabase db push                     # aplica al CLOUD
supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```
Una numeración, sin MCP/dashboard para lo rutinario, sin editar tipos a mano, `db reset` vuelve a andar.
