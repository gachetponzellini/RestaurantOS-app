#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// db-clone-cloud — copia la DATA del proyecto cloud (linked) al stack local.
//
//   Esquema → migraciones (`supabase db reset`), idéntico a prod.
//   Data    → pg_dump --data-only del cloud, cargada en el contenedor local
//             con triggers desactivados (session_replication_role=replica)
//             para no re-disparar correlativos/stock/etc. ni romper FKs.
//
// ⚠️  Copia data REAL de producción a tu disco: incluye clientes y secretos
//     por negocio (tokens MP, certs ARCA/AFIP, keys del chatbot). El volcado
//     queda en supabase/.clone/ (gitignored), pero tenelo presente.
//
// Requisitos: Docker Desktop abierto + stack local arriba (`pnpm supa:start`).
// La 1ª vez `db dump --linked` puede pedirte la password de la DB cloud.
//
//   node scripts/db-clone-cloud.mjs
// ─────────────────────────────────────────────────────────────────────────
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";

const CONTAINER = "supabase_db_Pedidos"; // = project_id de supabase/config.toml
const DIR = "supabase/.clone";
const PUBLIC_SQL = `${DIR}/public.sql`;
const AUTH_SQL = `${DIR}/auth.sql`;

function run(cmd) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

mkdirSync(DIR, { recursive: true });

// 1. El contenedor local tiene que existir.
try {
  execSync(`docker inspect ${CONTAINER}`, { stdio: "ignore" });
} catch {
  console.error(
    `✗ No encuentro el contenedor ${CONTAINER}.\n  Arrancá el stack local:  pnpm supa:start`,
  );
  process.exit(1);
}

// 2. Dump del cloud (linked). data-only: public + auth (para tener los usuarios).
console.log("→ Volcando data del cloud (puede pedir la password de la DB)…");
run(`pnpm exec supabase db dump --linked --data-only -f ${PUBLIC_SQL}`);
run(`pnpm exec supabase db dump --linked --data-only --schema auth -f ${AUTH_SQL}`);

// 3. Esquema local limpio desde el dump del cloud (NO `supabase db reset`:
//    las migraciones locales están drifteadas, ver db-load-cloud-schema.mjs).
run(`node scripts/db-load-cloud-schema.mjs`);

// 3b. Limpiar el auth local (usuarios del seed / superadmin) para que el clon
//     sea EXACTO: solo van a quedar los usuarios reales del cloud.
console.log("→ Limpiando usuarios del auth local…");
run(
  `docker exec -i ${CONTAINER} psql -U postgres -d postgres -q -c "truncate auth.users cascade;"`,
);

// 4. Cargar auth primero (los usuarios), después public. Triggers off.
loadIntoLocal(AUTH_SQL);
loadIntoLocal(PUBLIC_SQL);

console.log("\n✓ Data del cloud clonada al stack local.");
console.log(
  "  Para loguearte local (los usuarios de Google no tienen password):",
);
console.log("    pnpm local:login tu-email@ejemplo.com   # setea pass demo1234");

function loadIntoLocal(file) {
  // Prepend para desactivar triggers/FK durante el COPY de la sesión.
  const sql = `SET session_replication_role = replica;\n${readFileSync(file, "utf8")}`;
  console.log(`\n$ psql < ${file}  (en ${CONTAINER})`);
  execSync(
    `docker exec -i ${CONTAINER} psql -U postgres -d postgres -v ON_ERROR_STOP=0 -q`,
    { input: sql, stdio: ["pipe", "inherit", "inherit"] },
  );
}
