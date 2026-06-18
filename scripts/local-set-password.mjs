#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// local-set-password — setea una contraseña a un usuario en el AUTH LOCAL,
// para poder loguearte con email+password aunque el usuario sea de Google
// (los usuarios OAuth no tienen contraseña). Solo toca el stack local.
//
//   node scripts/local-set-password.mjs <email> [password]   # default: demo1234
// ─────────────────────────────────────────────────────────────────────────
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
const password = process.argv[3] || "demo1234";
if (!email) {
  console.error("Uso: node scripts/local-set-password.mjs <email> [password]");
  process.exit(1);
}

const stripQuotes = (v) => v.replace(/^["']|["']$/g, "");
let status;
try {
  status = execSync("pnpm exec supabase status -o env", { encoding: "utf8" });
} catch {
  console.error("✗ El stack local no responde. Corré:  pnpm supa:start");
  process.exit(1);
}
const env = {};
for (const line of status.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = stripQuotes(m[2]);
}

const sb = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error: listErr } = await sb.auth.admin.listUsers({ perPage: 1000 });
if (listErr) {
  console.error("✗", listErr.message);
  process.exit(1);
}
const user = data.users.find(
  (u) => u.email?.toLowerCase() === email.toLowerCase(),
);
if (!user) {
  console.error(
    `✗ No existe "${email}" en el auth local. ¿Clonaste la data (pnpm db:clone) o seedeaste (pnpm setup:local)?`,
  );
  process.exit(1);
}

const { error } = await sb.auth.admin.updateUserById(user.id, {
  password,
  email_confirm: true,
});
if (error) {
  console.error("✗", error.message);
  process.exit(1);
}
console.log(`✓ Password de ${email} seteado a "${password}" — login local listo.`);
