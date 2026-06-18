#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// create-superadmin — crea (o actualiza) un usuario en el AUTH LOCAL y lo
// marca como platform admin (is_platform_admin = true). Solo toca el stack
// local; nunca producción.
//
//   node scripts/create-superadmin.mjs <email> <password> ["Nombre Completo"]
// ─────────────────────────────────────────────────────────────────────────
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2];
const password = process.argv[3];
const fullName = process.argv[4] || email.split("@")[0];
if (!email || !password) {
  console.error(
    'Uso: node scripts/create-superadmin.mjs <email> <password> ["Nombre"]',
  );
  process.exit(1);
}

// Creds del stack local (NO producción).
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
if (!env.API_URL || !env.SERVICE_ROLE_KEY) {
  console.error("✗ No pude leer las creds locales de `supabase status`.");
  process.exit(1);
}
// Guardrail: solo local.
if (!/127\.0\.0\.1|localhost/.test(env.API_URL)) {
  console.error(`✗ API_URL no es local (${env.API_URL}). Abortando por seguridad.`);
  process.exit(1);
}

const sb = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// 1. Crear o actualizar el auth user.
const { data: list, error: listErr } = await sb.auth.admin.listUsers({
  perPage: 1000,
});
if (listErr) {
  console.error("✗ listUsers:", listErr.message);
  process.exit(1);
}
let user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (user) {
  const { error } = await sb.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    console.error("✗ updateUser:", error.message);
    process.exit(1);
  }
  console.log(`✓ Auth user existente actualizado: ${email}`);
} else {
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    console.error("✗ createUser:", error.message);
    process.exit(1);
  }
  user = data.user;
  console.log(`✓ Auth user creado: ${email}`);
}

// 2. Reflejar en public.users + marcar platform admin.
const { error: upsertErr } = await sb
  .from("users")
  .upsert({ id: user.id, email, full_name: fullName }, { onConflict: "id" });
if (upsertErr) {
  console.error("✗ upsert public.users:", upsertErr.message);
  process.exit(1);
}
const { error: flagErr } = await sb
  .from("users")
  .update({ is_platform_admin: true })
  .eq("id", user.id);
if (flagErr) {
  console.error("✗ set is_platform_admin:", flagErr.message);
  process.exit(1);
}

console.log(`✓ ${email} es SUPER ADMIN (is_platform_admin = true) en el local.`);
console.log(`  Login:  ${email}  /  ${password}`);
