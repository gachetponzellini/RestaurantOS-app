#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// env-switch — cambia SOLO las 3 variables de Supabase en .env.local entre:
//   • cloud  → producción (guardadas en .env.cloud)
//   • local  → stack de `supabase start` (leídas en vivo de `supabase status`)
//
// El resto de .env.local (Google, Anthropic, ROOT_DOMAIN, etc.) queda intacto.
// La 1ª vez snapshotea las vars actuales (que asumimos = prod) a .env.cloud,
// así nunca se pierden las credenciales de producción.
//
//   node scripts/env-switch.mjs <local|cloud>
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const SUPA_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const ENV_LOCAL = ".env.local";
const ENV_CLOUD = ".env.cloud";

const target = (process.argv[2] || "").toLowerCase();
if (target !== "local" && target !== "cloud") {
  console.error("Uso: node scripts/env-switch.mjs <local|cloud>");
  process.exit(1);
}

const stripQuotes = (v) => v.replace(/^["']|["']$/g, "");

function parseEnv(text) {
  const map = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map[m[1]] = stripQuotes(m[2]);
  }
  return map;
}

if (!existsSync(ENV_LOCAL)) {
  console.error(`✗ No existe ${ENV_LOCAL}. Copiá .env.local.example primero.`);
  process.exit(1);
}
let localText = readFileSync(ENV_LOCAL, "utf8");
const current = parseEnv(localText);

// Bootstrap: la 1ª vez snapshoteamos las vars actuales (= prod) a .env.cloud.
if (!existsSync(ENV_CLOUD)) {
  const body = SUPA_KEYS.map((k) => `${k}=${current[k] ?? ""}`).join("\n");
  writeFileSync(
    ENV_CLOUD,
    `# Perfil CLOUD (producción) — snapshot generado por env-switch. Gitignored.\n# NO commitear. Para regenerar, borralo estando en perfil cloud y re-corré env:cloud.\n${body}\n`,
  );
  console.log(`✓ Snapshot de las vars de Supabase de producción → ${ENV_CLOUD}`);
}

// Resolver los valores del perfil destino.
const values = {};
if (target === "cloud") {
  const cloud = parseEnv(readFileSync(ENV_CLOUD, "utf8"));
  for (const k of SUPA_KEYS) values[k] = cloud[k] ?? "";
  if (!values.NEXT_PUBLIC_SUPABASE_URL) {
    console.error(`✗ ${ENV_CLOUD} no tiene las vars de Supabase. Revisalo.`);
    process.exit(1);
  }
} else {
  let statusEnv;
  try {
    statusEnv = execSync("pnpm exec supabase status -o env", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    console.error(
      "✗ El stack local no responde. Arrancalo primero:  pnpm supa:start",
    );
    process.exit(1);
  }
  const s = parseEnv(statusEnv);
  values.NEXT_PUBLIC_SUPABASE_URL = s.API_URL || "";
  values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = s.ANON_KEY || "";
  values.SUPABASE_SERVICE_ROLE_KEY = s.SERVICE_ROLE_KEY || "";
  if (!values.NEXT_PUBLIC_SUPABASE_URL) {
    console.error("✗ No pude leer las creds locales de `supabase status`.");
    process.exit(1);
  }
}

// Reescribir SOLO las 3 líneas en .env.local (preservar todo lo demás).
for (const k of SUPA_KEYS) {
  const re = new RegExp(`^${k}=.*$`, "m");
  const line = `${k}=${values[k]}`;
  localText = re.test(localText)
    ? localText.replace(re, line)
    : localText + (localText.endsWith("\n") ? "" : "\n") + line + "\n";
}
writeFileSync(ENV_LOCAL, localText);

console.log(
  `✓ .env.local → perfil ${target.toUpperCase()}  (${values.NEXT_PUBLIC_SUPABASE_URL})`,
);
