// @ts-nocheck
/**
 * delete-business.ts — Borra por completo uno o más negocios (FK-safe).
 *
 * Replica el orden de limpieza de seed-estructura.ts::fase0_cleanup (que ya
 * resuelve los FKs RESTRICT internos: cajas, ingredients, products,
 * orders, stations, customers) y al final borra la fila de `businesses`.
 * El resto de tablas con `business_id` caen por ON DELETE CASCADE.
 *
 * NO toca auth.users (los usuarios @demo.test son compartidos con otros
 * negocios demo, p.ej. golf-jcr).
 *
 * Uso:  npx tsx scripts/delete-business.ts <slug> [<slug> ...]
 *
 * Apunta al entorno de `.env.local` (local o cloud según `env-switch`).
 * Usa service_role key → bypasea RLS.
 */

import { resolve } from "path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

// Slugs que NUNCA se borran (data valiosa). Si se pasan, se ignoran con warning.
const PROTECTED = new Set(["golf-jcr"]);

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const slugs = process.argv.slice(2);
if (slugs.length === 0) {
  console.error("Uso: npx tsx scripts/delete-business.ts <slug> [<slug> ...]");
  process.exit(1);
}

async function cleanupChildren(businessId: string) {
  const del = async (table: string, extra?: (q: any) => any) => {
    let q = sb.from(table).delete().eq("business_id", businessId);
    if (extra) q = extra(q);
    const { error } = await q;
    if (error) console.log(`    ⚠ ${table}: ${error.message}`);
  };

  // 1. Datos operativos con FKs RESTRICT → primero
  await del("invoices");
  await del("payments");
  await del("caja_movimientos");
  await del("caja_cortes");
  await del("stock_movimientos");
  await del("clock_entries"); // NO ACTION sobre businesses → obligatorio antes del row
  await del("notifications");
  await del("tables_audit_log");

  // 2. campaign_messages (sin business_id) vía campaigns
  const { data: camps } = await sb.from("campaigns").select("id").eq("business_id", businessId);
  if (camps?.length) {
    await sb.from("campaign_messages").delete().in("campaign_id", camps.map((c: any) => c.id));
  }

  // 3. Reset tables.current_order_id antes de borrar orders
  const { data: fps } = await sb.from("floor_plans").select("id").eq("business_id", businessId);
  if (fps?.length) {
    for (const fp of fps) {
      await sb.from("tables")
        .update({ current_order_id: null, mozo_id: null, operational_status: "libre", opened_at: null })
        .eq("floor_plan_id", fp.id);
    }
  }

  // 4. Orders cascade → order_items, comandas, comanda_items, modifiers, splits, history
  await del("orders");

  // 5. Resto de datos operativos
  await del("reservations");
  await del("customers");
  await del("campaigns");
  await del("promo_codes");
  await del("cajas");

  // 6. Chatbot
  const { data: contacts } = await sb.from("chatbot_contacts").select("id").eq("business_id", businessId);
  if (contacts?.length) {
    for (const c of contacts) {
      await sb.from("chatbot_conversations").delete().eq("contact_id", c.id);
    }
    await sb.from("chatbot_contacts").delete().eq("business_id", businessId);
  }
  await sb.from("chatbot_configs").delete().eq("business_id", businessId);

  // 7. Estructura física — floor_plans cascade → tables
  await sb.from("floor_plans").delete().eq("business_id", businessId);

  // 8. Menús del día
  await sb.from("daily_menus").delete().eq("business_id", businessId);

  // 9. Catálogo — products cascade → modifier_groups, modifiers, recipes, stock_items
  await del("products");

  // 10. Ingredientes (recipes ya cascadeó con products; ingredient_recipes es RESTRICT)
  const { data: ings } = await sb.from("ingredients").select("id").eq("business_id", businessId);
  if (ings?.length) {
    const ingIds = ings.map((i: any) => i.id);
    await sb.from("ingredient_recipes").delete().in("parent_ingredient_id", ingIds);
    await sb.from("ingredient_recipes").delete().in("child_ingredient_id", ingIds);
  }
  await del("ingredients");

  // 11. Resto catálogo
  await del("categories");
  await del("super_categories");
  await del("stations");

  // 12. Config
  await del("reservation_settings");
  await del("payment_method_configs");
  await del("business_hours");
}

async function deleteBusiness(slug: string) {
  if (PROTECTED.has(slug)) {
    console.log(`\n⚠ "${slug}" está protegido — NO se borra.`);
    return;
  }

  const { data: biz } = await sb
    .from("businesses")
    .select("id, name")
    .eq("slug", slug)
    .maybeSingle();

  if (!biz) {
    console.log(`\n• "${slug}" no existe — skip.`);
    return;
  }

  console.log(`\n══ Borrando "${slug}" (${biz.name} · ${biz.id}) ══`);
  await cleanupChildren(biz.id);

  const { error } = await sb.from("businesses").delete().eq("id", biz.id);
  if (error) {
    console.error(`  ✗ delete businesses: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.log(`  ✓ "${slug}" borrado por completo`);
  }
}

async function main() {
  console.log(`Target: ${SUPABASE_URL}`);
  for (const slug of slugs) {
    await deleteBusiness(slug);
  }
  console.log("\n✓ Done.");
}

main();
