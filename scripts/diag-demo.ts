/**
 * Diagnóstico rápido del estado de la DB para un business.
 *
 * Muestra qué tiene el negocio que es relevante para la pantalla
 * /admin/local: orders del día, orders open dine_in, comandas activas,
 * stations, mesas, mozos, caja.
 *
 * Uso:
 *   npx tsx scripts/diag-demo.ts [slug]
 *
 * Default: golf-jcr.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const SLUG = process.argv[2] ?? "golf-jcr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) { console.error("Missing env vars."); process.exit(1); }
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function main() {
  console.log(`\n━━━ Diagnóstico → "${SLUG}" ━━━\n`);

  const { data: business } = await supabase
    .from("businesses").select("id, name, timezone")
    .eq("slug", SLUG).maybeSingle();
  if (!business) { console.error(`✗ Negocio "${SLUG}" no existe.`); process.exit(1); }
  console.log(`Negocio: ${business.name} (id=${business.id}, tz=${business.timezone})`);

  const today = startOfToday();

  // 1. Orders del día de hoy (canal online → tab "Pedidos online")
  const { data: onlineToday } = await supabase
    .from("orders")
    .select("id, order_number, delivery_type, status, created_at")
    .eq("business_id", business.id)
    .neq("delivery_type", "dine_in")
    .gte("created_at", today);
  console.log(`\n[Pedidos online HOY] (delivery/pickup/take_away)`);
  console.log(`  total: ${onlineToday?.length ?? 0}`);
  for (const o of (onlineToday ?? []).slice(0, 5)) {
    console.log(`  · #${o.order_number} ${o.delivery_type} ${o.status} (${o.created_at})`);
  }

  // 2. Orders dine_in open (→ tab "Salón")
  const { data: dineOpen } = await supabase
    .from("orders")
    .select("id, order_number, table_id, status, lifecycle_status, customer_name, created_at")
    .eq("business_id", business.id)
    .eq("delivery_type", "dine_in")
    .eq("lifecycle_status", "open");
  console.log(`\n[Salón — orders dine_in OPEN]`);
  console.log(`  total: ${dineOpen?.length ?? 0}`);
  for (const o of (dineOpen ?? [])) {
    console.log(`  · #${o.order_number} mesa=${o.table_id?.slice(0, 8)} ${o.status} ${o.customer_name} (created ${o.created_at})`);
  }

  // 3. TODAS las comandas del business (no solo activas) ordenadas por fecha
  // Usamos service client + inner join contra orders para garantizar el
  // filtro correcto. Si el inner join no trae nada, hay problema de business_id.
  const { data: allComandas, error: comErr } = await supabase
    .from("comandas")
    .select("id, status, batch, station_id, emitted_at, delivered_at, orders!inner(business_id, order_number, customer_name, lifecycle_status)")
    .eq("orders.business_id", business.id)
    .order("emitted_at", { ascending: false })
    .limit(50);
  if (comErr) console.error(`  ✗ query comandas:`, comErr.message);

  console.log(`\n[Comandas — TODAS] (últimas 50 del business via inner join orders)`);
  console.log(`  total: ${allComandas?.length ?? 0}`);
  type ComandaRow = { status: string; batch: number; station_id: string | null; emitted_at: string; orders: { order_number: number; customer_name: string; lifecycle_status: string } | { order_number: number; customer_name: string; lifecycle_status: string }[] | null };
  const byStatus = new Map<string, number>();
  for (const c of ((allComandas ?? []) as unknown as ComandaRow[])) {
    byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
  }
  for (const [st, count] of byStatus) console.log(`  · ${st}: ${count}`);
  console.log(`  primeras 10:`);
  for (const c of ((allComandas ?? []) as unknown as ComandaRow[]).slice(0, 10)) {
    const ord = Array.isArray(c.orders) ? c.orders[0] : c.orders;
    console.log(`    #${ord?.order_number} ${c.status.padEnd(15)} batch=${c.batch} station=${c.station_id?.slice(0, 8)} cust=${ord?.customer_name}`);
  }

  // 3b. Comandas crudas (sin join) por si el inner join es el problema
  const { data: rawComandas, count: rawCount } = await supabase
    .from("comandas")
    .select("id, status, order_id", { count: "exact", head: false })
    .limit(5);
  console.log(`\n[Comandas — raw global, primeras 5]`);
  console.log(`  total en DB: ${rawCount}`);
  for (const c of (rawComandas ?? [])) {
    // chequeamos cada una contra business
    const { data: ord } = await supabase
      .from("orders").select("business_id, order_number")
      .eq("id", c.order_id).maybeSingle();
    const matchesBiz = ord?.business_id === business.id;
    console.log(`    ${c.status.padEnd(15)} order=${ord?.order_number} biz_match=${matchesBiz}`);
  }

  // 4. Stations
  const { data: stations } = await supabase
    .from("stations").select("id, name, is_active")
    .eq("business_id", business.id).order("sort_order");
  console.log(`\n[Stations]`);
  console.log(`  total: ${stations?.length ?? 0}`);
  for (const s of (stations ?? [])) {
    console.log(`  · ${s.name} (active=${s.is_active})`);
  }

  // 5. Floor plans + mesas
  const { data: fps } = await supabase
    .from("floor_plans").select("id, name").eq("business_id", business.id);
  console.log(`\n[Floor plans]`);
  console.log(`  total: ${fps?.length ?? 0}`);
  for (const fp of (fps ?? [])) {
    const { count } = await supabase
      .from("tables").select("id", { count: "exact", head: true })
      .eq("floor_plan_id", fp.id);
    console.log(`  · ${fp.name}: ${count} mesas`);
  }

  // 6. Mesas por estado
  if (fps && fps.length > 0) {
    const { data: tables } = await supabase
      .from("tables").select("id, label, operational_status, current_order_id, mozo_id")
      .in("floor_plan_id", fps.map((f) => f.id))
      .eq("status", "active")
      .order("label");
    console.log(`\n[Mesas activas — por estado]`);
    const byState = new Map<string, number>();
    for (const t of (tables ?? [])) {
      byState.set(t.operational_status, (byState.get(t.operational_status) ?? 0) + 1);
    }
    for (const [state, count] of byState) console.log(`  · ${state}: ${count}`);

    const conOrder = (tables ?? []).filter((t) => t.current_order_id);
    console.log(`  · con current_order_id: ${conOrder.length}`);
  }

  // 7. Mozos
  const { data: mozos } = await supabase
    .from("business_users")
    .select("user_id, role, full_name")
    .eq("business_id", business.id);
  console.log(`\n[Equipo]`);
  for (const m of (mozos ?? [])) {
    console.log(`  · ${m.role.padEnd(10)} ${m.full_name} (${m.user_id.slice(0, 8)})`);
  }

  // 8. Caja
  const { data: cortes } = await supabase
    .from("caja_cortes").select("id, closing_cash_cents, difference_cents, created_at")
    .eq("business_id", business.id)
    .order("created_at", { ascending: false })
    .limit(10);
  console.log(`\n[Caja]`);
  console.log(`  cortes recientes: ${cortes?.length ?? 0}`);
  for (const c of (cortes ?? [])) {
    console.log(`  · cierre=$${Number(c.closing_cash_cents) / 100} diff=$${Number(c.difference_cents) / 100} (${c.created_at})`);
  }

  console.log();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
