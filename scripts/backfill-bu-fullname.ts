// @ts-nocheck
/**
 * backfill-bu-fullname.ts — Rellena business_users.full_name desde users.full_name.
 *
 * Necesario porque seeds viejos no seteaban business_users.full_name (la app de
 * fichaje / RRHH lee ese campo → mostraba "Empleado"/"—"). Idempotente.
 *
 * Uso:  npx tsx scripts/backfill-bu-fullname.ts
 * Apunta al entorno de .env.local. Usa service_role (bypasea RLS).
 */
import { resolve } from "path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(__dirname, "../.env.local") });
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  console.log(`Target: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  const { data: users } = await sb.from("users").select("id, full_name");
  const nameById = new Map((users ?? []).map((u: any) => [u.id, u.full_name]));

  const { data: bus } = await sb
    .from("business_users")
    .select("business_id, user_id, full_name");

  let updated = 0;
  for (const bu of bus ?? []) {
    const fn = nameById.get(bu.user_id);
    if (fn && fn !== bu.full_name) {
      const { error } = await sb
        .from("business_users")
        .update({ full_name: fn })
        .eq("business_id", bu.business_id)
        .eq("user_id", bu.user_id);
      if (error) console.log(`  ⚠ ${bu.user_id}: ${error.message}`);
      else updated++;
    }
  }
  console.log(`✓ business_users.full_name actualizados: ${updated}`);
}
main();
