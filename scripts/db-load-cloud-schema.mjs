#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// db-load-cloud-schema — reconstruye el ESQUEMA del local desde un dump del
// cloud (fuente de verdad). Reemplaza a `supabase db reset`, que hoy está
// roto porque las migraciones locales (supabase/migrations) divergieron del
// cloud (faltan archivos aplicados vía MCP: business_groups, rls_auto_enable,
// split de 0072, etc.).
//
//   1. Si no hay dump (o se pasa --pull), lo baja: `supabase db dump --linked`.
//   2. Dropea y recrea el schema `public` del stack local.
//   3. Aplica el dump → esquema idéntico a producción.
//
// NO carga datos (eso lo hacen los seeds o db:clone). Solo esquema.
//
//   node scripts/db-load-cloud-schema.mjs [--pull]
// ─────────────────────────────────────────────────────────────────────────
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const CONTAINER = "supabase_db_Pedidos"; // = project_id de supabase/config.toml
const DUMP = "supabase/.clone/cloud_schema.sql";
const pull = process.argv.includes("--pull");

function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
}

// 0. El contenedor local tiene que existir.
try {
  execSync(`docker inspect ${CONTAINER}`, { stdio: "ignore" });
} catch {
  console.error(`✗ No encuentro ${CONTAINER}. Arrancá el stack:  pnpm supa:start`);
  process.exit(1);
}

// 1. Dump del cloud (si falta o si se pide --pull). Puede pedir la DB password.
mkdirSync("supabase/.clone", { recursive: true });
if (pull || !existsSync(DUMP)) {
  console.log("→ Bajando esquema del cloud (linked)…");
  run(`pnpm exec supabase db dump --linked -f ${DUMP}`);
} else {
  console.log(`→ Usando dump existente (${DUMP}). Pasá --pull para refrescarlo.`);
}

// 2. public limpio en el local.
console.log("→ Recreando schema public en el local…");
run(
  `docker exec -i ${CONTAINER} psql -U postgres -d postgres -q -c "drop schema if exists public cascade; create schema public; alter schema public owner to postgres; grant usage on schema public to anon, authenticated, service_role; grant all on schema public to postgres, service_role;"`,
);

// 3. Aplicar el dump.
console.log("→ Aplicando el esquema de prod al local…");
execSync(
  `docker exec -i ${CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q`,
  {
    stdio: ["pipe", "inherit", "inherit"],
    input: readFileSync(DUMP),
    maxBuffer: 256 * 1024 * 1024,
  },
);

// 4. Policies de storage.objects. El dump del cloud trae solo `public`, así que
//    las policies del schema `storage` (migraciones 0004/0007/0022/0054) no
//    llegan al local → uploads fallaban con "new row violates RLS policy".
//    Las aplicamos desde un fixture tracked (réplica del cloud).
const STORAGE_FIXTURE = "supabase/local-fixtures/storage_policies.sql";
if (existsSync(STORAGE_FIXTURE)) {
  console.log("→ Aplicando policies de storage.objects al local…");
  execSync(
    `docker exec -i ${CONTAINER} psql -U postgres -d postgres -q`,
    { stdio: ["pipe", "inherit", "inherit"], input: readFileSync(STORAGE_FIXTURE) },
  );
}

console.log("\n✓ Esquema del cloud aplicado al local.");
console.log("  Seguí con:  pnpm seed:estructura && pnpm seed:operativo");
