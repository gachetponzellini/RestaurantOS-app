// @ts-nocheck
/**
 * seed-operativo.ts
 *
 * Populates LIVE OPERATIONAL STATE for a restaurant — the kind of data that
 * makes the dashboard look like a real busy service. Requires the business to
 * already exist (created by seed-estructura.ts).
 *
 * Usage:
 *   npx tsx scripts/seed-operativo.ts [slug]
 *
 * Default slug: golf-jcr
 */

import { resolve } from "path";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  rand,
  randInt,
  pickWeighted,
  minsAgo,
  FIRST_NAMES,
  LAST_NAMES,
  STREETS,
  RESERVATION_NOTES,
  TEAM,
} from "./seed-data";

// ════════════════════════════════════════════════════════════════════════════
// ENV + CLIENT
// ════════════════════════════════════════════════════════════════════════════

config({ path: resolve(__dirname, "../.env.local") });

const SLUG = process.argv[2] || "golf-jcr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString();
}

function daysAgo(d: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt;
}

function daysFromNow(d: number): Date {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt;
}

/** Build an Argentina-local ISO timestamp from a date and "HH:MM" slot. */
function argTimestamp(date: Date, slot: string): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  // Argentina is UTC-3 year-round
  return `${yyyy}-${mm}-${dd}T${slot}:00-03:00`;
}

function todayArg(): Date {
  // Return today in local calendar terms
  return new Date();
}

/** Pick N random unique items from array. */
function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, arr.length));
}

// Weighted product picker for orders
const PRODUCT_WEIGHT = [
  { category: "Parrilla", weight: 20 },
  { category: "Pastas", weight: 15 },
  { category: "Platos", weight: 15 },
  { category: "Minutas y Fritos", weight: 12 },
  { category: "Pescados", weight: 8 },
  { category: "Postres", weight: 8 },
  { category: "Gaseosas", weight: 6 },
  { category: "Cervezas", weight: 6 },
  { category: "Vinos", weight: 5 },
  { category: "Cafetería", weight: 3 },
  { category: "Entradas", weight: 2 },
];

// ════════════════════════════════════════════════════════════════════════════
// TYPES
// ════════════════════════════════════════════════════════════════════════════

type DBProduct = {
  id: string;
  name: string;
  price_cents: number;
  station_id: string | null;
  category_id: string | null;
  track_stock: boolean;
};

type DBCategory = { id: string; name: string; station_id: string | null };
type DBStation = { id: string; name: string };
type DBTable = { id: string; label: string; floor_plan_id: string; seats: number };
type DBFloorPlan = { id: string; name: string; business_id: string };

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  seed-operativo · ${SLUG}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── Load business ──────────────────────────────────────────────────────
  const { data: biz, error: bizErr } = await sb
    .from("businesses")
    .select("id, timezone")
    .eq("slug", SLUG)
    .single();

  if (bizErr || !biz) {
    console.error(`✗ Business "${SLUG}" not found. Run seed-estructura.ts first.`);
    process.exit(1);
  }

  const BIZ = biz.id as string;
  console.log(`✓ Business: ${SLUG} (${BIZ})\n`);

  // ══════════════════════════════════════════════════════════════════════
  // RESET PHASE
  // ══════════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  RESET — limpiando datos operativos");
  console.log("═══════════════════════════════════════════════════════════\n");

  // 1. payments
  const { error: e1 } = await sb.from("payments").delete().eq("business_id", BIZ);
  console.log(e1 ? `✗ payments: ${e1.message}` : "✓ payments deleted");

  // 2. caja_movimientos
  const { error: e2 } = await sb.from("caja_movimientos").delete().eq("business_id", BIZ);
  console.log(e2 ? `✗ caja_movimientos: ${e2.message}` : "✓ caja_movimientos deleted");

  // 3. caja_cortes
  const { error: e3 } = await sb.from("caja_cortes").delete().eq("business_id", BIZ);
  console.log(e3 ? `✗ caja_cortes: ${e3.message}` : "✓ caja_cortes deleted");

  // 4. clock_entries
  const { error: e4 } = await sb.from("clock_entries").delete().eq("business_id", BIZ);
  console.log(e4 ? `✗ clock_entries: ${e4.message}` : "✓ clock_entries deleted");

  // 5. stock_movimientos
  const { error: e5 } = await sb.from("stock_movimientos").delete().eq("business_id", BIZ);
  console.log(e5 ? `✗ stock_movimientos: ${e5.message}` : "✓ stock_movimientos deleted");

  // 6. Delete comandas via order_ids
  const { data: orderIds } = await sb
    .from("orders")
    .select("id")
    .eq("business_id", BIZ);
  if (orderIds && orderIds.length > 0) {
    const ids = orderIds.map((o) => o.id);
    // comanda_items cascade from comandas, so just delete comandas
    const { error: e6 } = await sb.from("comandas").delete().in("order_id", ids);
    console.log(e6 ? `✗ comandas: ${e6.message}` : `✓ comandas deleted (${ids.length} orders)`);
  } else {
    console.log("✓ comandas: none to delete");
  }

  // 7. Reset all tables to libre
  // Get all floor_plan ids for this business
  const { data: fps } = await sb
    .from("floor_plans")
    .select("id")
    .eq("business_id", BIZ);
  if (fps && fps.length > 0) {
    const fpIds = fps.map((fp) => fp.id);
    const { error: e7a } = await sb
      .from("tables")
      .update({
        current_order_id: null,
        opened_at: null,
        operational_status: "libre",
        mozo_id: null,
      })
      .in("floor_plan_id", fpIds);
    console.log(e7a ? `✗ tables reset: ${e7a.message}` : "✓ tables reset to libre");
  }

  // 8. orders (cascades order_items, order_splits, etc.)
  const { error: e8 } = await sb.from("orders").delete().eq("business_id", BIZ);
  console.log(e8 ? `✗ orders: ${e8.message}` : "✓ orders deleted");

  // 9. reservations
  const { error: e9 } = await sb.from("reservations").delete().eq("business_id", BIZ);
  console.log(e9 ? `✗ reservations: ${e9.message}` : "✓ reservations deleted");

  // 10. customers
  const { error: e10 } = await sb.from("customers").delete().eq("business_id", BIZ);
  console.log(e10 ? `✗ customers: ${e10.message}` : "✓ customers deleted");

  // 11. promo_codes
  const { error: e11 } = await sb.from("promo_codes").delete().eq("business_id", BIZ);
  console.log(e11 ? `✗ promo_codes: ${e11.message}` : "✓ promo_codes deleted");

  console.log("");

  // ══════════════════════════════════════════════════════════════════════
  // LOAD REFERENCE DATA
  // ══════════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  LOADING reference data");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Products
  const { data: products } = await sb
    .from("products")
    .select("id, name, price_cents, station_id, category_id, track_stock")
    .eq("business_id", BIZ)
    .eq("is_active", true);
  if (!products || products.length === 0) {
    console.error("✗ No products found. Run seed-estructura.ts first.");
    process.exit(1);
  }
  console.log(`✓ ${products.length} products loaded`);

  // Stations
  const { data: stations } = await sb
    .from("stations")
    .select("id, name")
    .eq("business_id", BIZ);
  console.log(`✓ ${stations?.length ?? 0} stations loaded`);

  // Categories
  const { data: categories } = await sb
    .from("categories")
    .select("id, name, station_id")
    .eq("business_id", BIZ);
  console.log(`✓ ${categories?.length ?? 0} categories loaded`);

  // Build category map
  const catMap = new Map<string, DBCategory>();
  for (const c of categories ?? []) catMap.set(c.id, c);

  // Build station name map
  const stationMap = new Map<string, DBStation>();
  for (const s of (stations ?? []) as DBStation[]) stationMap.set(s.id, s);

  // Resolve station_id per product: product override > category default
  function resolveStationId(p: DBProduct): string | null {
    if (p.station_id) return p.station_id;
    if (p.category_id) {
      const cat = catMap.get(p.category_id);
      if (cat?.station_id) return cat.station_id;
    }
    return null;
  }

  // Modifier groups + modifiers (para agregar a order_items)
  const { data: modifierGroups } = await sb
    .from("modifier_groups")
    .select("id, name, product_id")
    .eq("business_id", BIZ);
  const modGroupsByProduct = new Map<string, { group_id: string; group_name: string }[]>();
  for (const mg of modifierGroups ?? []) {
    const arr = modGroupsByProduct.get(mg.product_id) ?? [];
    arr.push({ group_id: mg.id, group_name: mg.name });
    modGroupsByProduct.set(mg.product_id, arr);
  }

  const { data: allModifiers } = await sb
    .from("modifiers")
    .select("id, name, price_delta_cents, group_id")
    .in("group_id", (modifierGroups ?? []).map((mg) => mg.id));
  const modsByGroup = new Map<string, typeof allModifiers>();
  for (const m of allModifiers ?? []) {
    const arr = modsByGroup.get(m.group_id) ?? [];
    arr.push(m);
    modsByGroup.set(m.group_id, arr);
  }
  console.log(`✓ ${modifierGroups?.length ?? 0} modifier groups, ${allModifiers?.length ?? 0} modifiers loaded`);

  // Build category name → products mapping for weighted picks
  const catNameMap = new Map<string, string>(); // category.id → category.name
  for (const c of categories ?? []) catNameMap.set(c.id, c.name);

  function pickRandomProducts(count: number): DBProduct[] {
    const result: DBProduct[] = [];
    for (let i = 0; i < count; i++) {
      const catName = pickWeighted(PRODUCT_WEIGHT.map((w) => ({ value: w.category, weight: w.weight })));
      const matching = products!.filter((p) => {
        const cn = p.category_id ? catNameMap.get(p.category_id) : null;
        return cn === catName;
      });
      if (matching.length > 0) {
        result.push(rand(matching));
      } else {
        // fallback: any product
        result.push(rand(products!));
      }
    }
    return result;
  }

  // Floor plans + tables
  const { data: floorPlans } = await sb
    .from("floor_plans")
    .select("id, name, business_id")
    .eq("business_id", BIZ);
  console.log(`✓ ${floorPlans?.length ?? 0} floor plans loaded`);

  const allTables: (DBTable & { floor_plan_name: string })[] = [];
  for (const fp of (floorPlans ?? []) as DBFloorPlan[]) {
    const { data: tables } = await sb
      .from("tables")
      .select("id, label, floor_plan_id, seats")
      .eq("floor_plan_id", fp.id)
      .eq("status", "active");
    for (const t of (tables ?? []) as DBTable[]) {
      allTables.push({ ...t, floor_plan_name: fp.name });
    }
  }
  console.log(`✓ ${allTables.length} tables loaded`);

  // Salon principal tables (first floor plan) and Salon 2 tables
  const salonPrincipal = floorPlans?.find((fp) =>
    fp.name.toLowerCase().includes("principal") || fp.name.toLowerCase().includes("salón")
  ) ?? floorPlans?.[0];
  const salon2 = floorPlans?.find((fp) =>
    fp.name !== salonPrincipal?.name
  ) ?? floorPlans?.[1];

  const salonTables = allTables.filter((t) => t.floor_plan_id === salonPrincipal?.id);
  const salon2Tables = allTables.filter((t) => t.floor_plan_id === salon2?.id);

  // Team member user_ids
  const { data: businessUsers } = await sb
    .from("business_users")
    .select("user_id, role, pin")
    .eq("business_id", BIZ)
    .is("disabled_at", null);

  const teamUsers = businessUsers ?? [];
  console.log(`✓ ${teamUsers.length} team members loaded`);

  // Find specific team members by name (match from TEAM)
  const { data: allUsers } = await sb.from("users").select("id, full_name, email");
  const usersByEmail = new Map<string, { id: string; full_name: string }>();
  for (const u of allUsers ?? []) usersByEmail.set(u.email, u);

  const pedroUser = usersByEmail.get("pedro@demo.test");
  const diegoUser = usersByEmail.get("diego@demo.test");
  const luciaUser = usersByEmail.get("lucia@demo.test");
  const sofiaUser = usersByEmail.get("sofia@demo.test");
  const adminUser = usersByEmail.get("admin@demo.test");

  // Caja
  const { data: cajas } = await sb
    .from("cajas")
    .select("id, name")
    .eq("business_id", BIZ)
    .eq("is_active", true)
    .limit(1);
  let cajaId = cajas?.[0]?.id;
  if (!cajaId) {
    const { data: newCaja } = await sb
      .from("cajas")
      .insert({ business_id: BIZ, name: "Caja Principal" })
      .select("id")
      .single();
    cajaId = newCaja?.id;
    console.log("✓ Created Caja Principal");
  } else {
    console.log(`✓ Caja: ${cajas![0].name} (${cajaId})`);
  }

  // Reset stock_items quantities
  const { data: stockItems } = await sb
    .from("stock_items")
    .select("id, product_id")
    .eq("business_id", BIZ);
  if (stockItems && stockItems.length > 0) {
    for (const si of stockItems) {
      const qty = Math.random() < 0.75 ? randInt(12, 48) : randInt(1, 3);
      await sb.from("stock_items").update({ current_qty: qty }).eq("id", si.id);
    }
    console.log(`✓ ${stockItems.length} stock_items reset with random quantities`);
  }

  console.log("");

  // ══════════════════════════════════════════════════════════════════════
  // FASE 1 — CUSTOMERS
  // ══════════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  FASE 1 — Customers");
  console.log("═══════════════════════════════════════════════════════════\n");

  const customerRows = [];
  for (let i = 0; i < 15; i++) {
    const fn = FIRST_NAMES[i % FIRST_NAMES.length];
    const ln = LAST_NAMES[i % LAST_NAMES.length];
    const phone = `+549341555${String(1000 + i).slice(-4)}`;
    customerRows.push({
      business_id: BIZ,
      name: `${fn} ${ln}`,
      phone,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}@example.com`,
    });
  }

  const { data: customers, error: custErr } = await sb
    .from("customers")
    .upsert(customerRows, { onConflict: "business_id,phone" })
    .select("id, name, phone");

  if (custErr) {
    console.error(`✗ Customers: ${custErr.message}`);
  } else {
    console.log(`✓ ${customers!.length} customers upserted`);
  }

  // Customer addresses (para delivery)
  if (customers?.length) {
    let addrCount = 0;
    for (const c of customers) {
      const numAddrs = randInt(1, 2);
      for (let a = 0; a < numAddrs; a++) {
        const { error: addrErr } = await sb.from("customer_addresses").insert({
          customer_id: c.id,
          label: a === 0 ? "Casa" : "Trabajo",
          street: `${rand(STREETS)} ${randInt(100, 4000)}`,
          number: null,
          apartment: Math.random() < 0.3 ? `${randInt(1, 10)}°${rand(["A", "B", "C"])}` : null,
          notes: Math.random() < 0.2 ? "Timbre no anda, llamar al llegar" : null,
        });
        if (!addrErr) addrCount++;
      }
    }
    console.log(`✓ ${addrCount} customer addresses\n`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // FASE 2 — HISTORICAL ORDERS (last 30 days)
  // ══════════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  FASE 2 — Historical orders (últimos 30 días)");
  console.log("═══════════════════════════════════════════════════════════\n");

  let historicalCount = 0;
  const ORDER_COUNT = 60;

  for (let i = 0; i < ORDER_COUNT; i++) {
    const dayOffset = randInt(1, 30);
    const orderDate = daysAgo(dayOffset);
    orderDate.setHours(randInt(11, 22), randInt(0, 59), 0, 0);

    const deliveryType = pickWeighted([
      { value: "dine_in" as const, weight: 70 },
      { value: "delivery" as const, weight: 20 },
      { value: "pickup" as const, weight: 10 },
    ]);

    // Históricas = órdenes PASADAS (dayOffset 1-30): siempre terminales.
    // Nunca `ready`/`open`, porque una orden dine_in abierta pegada a una mesa
    // sin abrirla deja la mesa `libre` con orden activa (inconsistencia que se
    // veía como "mesa Libre con orden #N"). Las mesas vivas se siembran aparte.
    const statusVal = pickWeighted([
      { value: "delivered" as const, weight: 85 },
      { value: "cancelled" as const, weight: 15 },
    ]);

    const itemCount = randInt(2, 5);
    const orderProducts = pickRandomProducts(itemCount);

    // Pre-compute quantities so order totals match items
    const itemDefs = orderProducts.map((p) => {
      const qty = Math.random() < 0.2 ? randInt(2, 3) : 1;
      return { product: p, qty, lineCents: p.price_cents * qty };
    });
    const subtotalCents = itemDefs.reduce((s, d) => s + d.lineCents, 0);
    const deliveryFee = deliveryType === "delivery" ? 80000 : 0;
    const totalCents = subtotalCents + deliveryFee;

    const payMethod = pickWeighted([
      { value: "cash" as const, weight: 50 },
      { value: "card_manual" as const, weight: 30 },
      { value: "mp_qr" as const, weight: 20 },
    ]);

    const cust = customers ? rand(customers) : null;

    const lifecycleStatus = statusVal === "delivered" ? "closed" : "cancelled";

    const orderRow: Record<string, unknown> = {
      business_id: BIZ,
      order_number: 0, // trigger auto-assigns
      customer_id: cust?.id ?? null,
      customer_name: cust?.name ?? `Cliente ${i}`,
      customer_phone: cust?.phone ?? "+5493415550000",
      delivery_type: deliveryType,
      delivery_address: deliveryType === "delivery" ? `${rand(STREETS)} ${randInt(100, 4999)}` : null,
      delivery_fee_cents: deliveryFee,
      status: statusVal,
      subtotal_cents: subtotalCents,
      discount_cents: 0,
      total_cents: totalCents,
      payment_method: payMethod === "mp_qr" ? "mp" : "cash",
      payment_status: statusVal === "delivered" ? "paid" : "pending",
      lifecycle_status: lifecycleStatus,
      cancelled_reason: statusVal === "cancelled" ? "Cancelación del cliente" : null,
      cancelled_at: statusVal === "cancelled" ? orderDate.toISOString() : null,
      closed_at: statusVal === "delivered" ? orderDate.toISOString() : null,
      total_paid_cents: statusVal === "delivered" ? totalCents : 0,
      created_at: orderDate.toISOString(),
      mozo_id: deliveryType === "dine_in"
        ? rand([pedroUser, diegoUser, luciaUser].filter(Boolean))?.id ?? null
        : null,
    };

    if (deliveryType === "dine_in") {
      // Pick a random table for historical dine_in orders (no need to open table)
      const t = rand([...salonTables, ...salon2Tables]);
      orderRow.table_id = t?.id ?? null;
    }

    const { data: ord, error: ordErr } = await sb
      .from("orders")
      .insert(orderRow)
      .select("id")
      .single();

    if (ordErr) {
      console.error(`  ✗ Order ${i}: ${ordErr.message}`);
      continue;
    }

    // Insert order_items
    const items = itemDefs.map((d) => ({
      order_id: ord!.id,
      product_id: d.product.id,
      product_name: d.product.name,
      unit_price_cents: d.product.price_cents,
      quantity: d.qty,
      subtotal_cents: d.lineCents,
      station_id: resolveStationId(d.product),
      kitchen_status: statusVal === "delivered" ? "delivered" : "pending",
    }));

    await sb.from("order_items").insert(items);

    // Payment for delivered orders
    if (statusVal === "delivered" && cajaId) {
      const tipCents = deliveryType === "dine_in" && Math.random() < 0.4
        ? Math.round(totalCents * (randInt(5, 15) / 100))
        : 0;
      await sb.from("payments").insert({
        order_id: ord!.id,
        business_id: BIZ,
        caja_id: cajaId,
        method: payMethod,
        amount_cents: totalCents,
        tip_cents: tipCents,
        payment_status: "paid",
        operated_by: rand([adminUser, sofiaUser].filter(Boolean))?.id ?? null,
        created_at: orderDate.toISOString(),
      });
    }

    historicalCount++;
  }

  console.log(`✓ ${historicalCount} historical orders created\n`);

  // ══════════════════════════════════════════════════════════════════════
  // FASE 3 — TODAY'S DELIVERY/PICKUP ORDERS (kanban board)
  // ══════════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  FASE 3 — Today's delivery/pickup orders (kanban)");
  console.log("═══════════════════════════════════════════════════════════\n");

  type TodayOrderDef = {
    status: string;
    deliveryType: string;
    payMethod: string;
    customerName: string;
    itemCount: number;
    minsAgoCreated: number;
    minsAgoConfirmed?: number;
    cancelled_reason?: string;
    lifecycleStatus: string;
  };

  const todayOrders: TodayOrderDef[] = [
    { status: "pending", deliveryType: "delivery", payMethod: "cash", customerName: "María González", itemCount: 3, minsAgoCreated: 45, lifecycleStatus: "open" },
    { status: "pending", deliveryType: "pickup", payMethod: "cash", customerName: "Juan Rodríguez", itemCount: 2, minsAgoCreated: 30, lifecycleStatus: "open" },
    { status: "pending", deliveryType: "delivery", payMethod: "mp_qr", customerName: "Laura Fernández", itemCount: 4, minsAgoCreated: 15, lifecycleStatus: "open" },
    { status: "preparing", deliveryType: "delivery", payMethod: "cash", customerName: "Diego López", itemCount: 3, minsAgoCreated: 25, minsAgoConfirmed: 20, lifecycleStatus: "open" },
    { status: "preparing", deliveryType: "pickup", payMethod: "mp_qr", customerName: "Sofía Martínez", itemCount: 2, minsAgoCreated: 20, minsAgoConfirmed: 15, lifecycleStatus: "open" },
    { status: "ready", deliveryType: "pickup", payMethod: "cash", customerName: "Martín García", itemCount: 3, minsAgoCreated: 40, lifecycleStatus: "open" },
    { status: "delivered", deliveryType: "delivery", payMethod: "cash", customerName: "Carolina Pérez", itemCount: 2, minsAgoCreated: 120, lifecycleStatus: "closed" },
    { status: "cancelled", deliveryType: "delivery", payMethod: "cash", customerName: "Pablo Sánchez", itemCount: 1, minsAgoCreated: 60, cancelled_reason: "Cliente no contesta", lifecycleStatus: "cancelled" },
  ];

  for (const def of todayOrders) {
    const orderProducts = pickRandomProducts(def.itemCount);
    const subtotalCents = orderProducts.reduce((s, p) => s + p.price_cents, 0);
    const deliveryFee = def.deliveryType === "delivery" ? 80000 : 0;
    const totalCents = subtotalCents + deliveryFee;

    const createdAt = minsAgo(def.minsAgoCreated);

    const orderRow: Record<string, unknown> = {
      business_id: BIZ,
      order_number: 0,
      customer_name: def.customerName,
      customer_phone: `+549341555${randInt(1000, 9999)}`,
      delivery_type: def.deliveryType,
      delivery_address: def.deliveryType === "delivery" ? `${rand(STREETS)} ${randInt(100, 4999)}` : null,
      delivery_fee_cents: deliveryFee,
      status: def.status,
      subtotal_cents: subtotalCents,
      discount_cents: 0,
      total_cents: totalCents,
      payment_method: def.payMethod === "mp_qr" ? "mp" : "cash",
      payment_status: def.status === "delivered" ? "paid" : "pending",
      lifecycle_status: def.lifecycleStatus,
      cancelled_reason: def.cancelled_reason ?? null,
      cancelled_at: def.status === "cancelled" ? minsAgo(def.minsAgoCreated - 5) : null,
      closed_at: def.status === "delivered" ? minsAgo(10) : null,
      total_paid_cents: def.status === "delivered" ? totalCents : 0,
      created_at: createdAt,
    };

    const { data: ord, error: ordErr } = await sb
      .from("orders")
      .insert(orderRow)
      .select("id")
      .single();

    if (ordErr) {
      console.error(`  ✗ Today order "${def.customerName}": ${ordErr.message}`);
      continue;
    }

    // Insert order_items
    const kitchenStatus = def.status === "delivered" ? "delivered"
      : def.status === "ready" ? "ready"
      : def.status === "preparing" ? "preparing"
      : "pending";

    const items = orderProducts.map((p) => ({
      order_id: ord!.id,
      product_id: p.id,
      product_name: p.name,
      unit_price_cents: p.price_cents,
      quantity: 1,
      subtotal_cents: p.price_cents,
      station_id: resolveStationId(p),
      kitchen_status: kitchenStatus,
    }));

    const { data: insertedItems } = await sb
      .from("order_items")
      .insert(items)
      .select("id, station_id");

    // Create comandas for preparing/ready orders
    if ((def.status === "preparing" || def.status === "ready") && insertedItems) {
      const comandaStatus = def.status === "ready" ? "entregado" : "en_preparacion";

      // Group items by station
      const byStation = new Map<string, string[]>();
      for (const item of insertedItems) {
        if (item.station_id) {
          const arr = byStation.get(item.station_id) ?? [];
          arr.push(item.id);
          byStation.set(item.station_id, arr);
        }
      }

      for (const [stationId, itemIds] of byStation) {
        const { data: cmd } = await sb
          .from("comandas")
          .insert({
            order_id: ord!.id,
            station_id: stationId,
            batch: 1,
            status: comandaStatus,
            emitted_at: createdAt,
            delivered_at: comandaStatus === "entregado" ? minsAgo(def.minsAgoCreated - 15) : null,
          })
          .select("id")
          .single();

        if (cmd) {
          const ciRows = itemIds.map((oid) => ({
            comanda_id: cmd.id,
            order_item_id: oid,
          }));
          await sb.from("comanda_items").insert(ciRows);
        }
      }
    }

    // Payment for delivered
    if (def.status === "delivered" && cajaId) {
      await sb.from("payments").insert({
        order_id: ord!.id,
        business_id: BIZ,
        caja_id: cajaId,
        method: def.payMethod === "mp_qr" ? "mp_qr" : "cash",
        amount_cents: totalCents,
        payment_status: "paid",
        operated_by: adminUser?.id ?? null,
        created_at: minsAgo(10),
      });
    }

    console.log(`  ✓ ${def.status.padEnd(10)} ${def.deliveryType.padEnd(8)} ${def.customerName}`);
  }

  console.log(`✓ ${todayOrders.length} today orders created\n`);

  // ══════════════════════════════════════════════════════════════════════
  // FASE 4 — LIVE DINE-IN TABLES (floor plan)
  // ══════════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  FASE 4 — Live dine-in tables");
  console.log("═══════════════════════════════════════════════════════════\n");

  type LiveTableDef = {
    floorPlanTables: typeof salonTables;
    tableIndex: number;
    operationalStatus: "ocupada" | "pidio_cuenta";
    openedMinsAgo: number;
    itemCount: number;
    comandaPattern: ("pendiente" | "en_preparacion" | "entregado")[];
    label: string;
    mozoUser: { id: string } | undefined;
    billRequestedMinsAgo?: number;
  };

  const liveTableDefs: LiveTableDef[] = [
    // ── Salón principal ──
    // T3 - Terraza, acaban de sentarse
    {
      floorPlanTables: salonTables,
      tableIndex: 2,
      operationalStatus: "ocupada",
      openedMinsAgo: 5,
      itemCount: 3,
      comandaPattern: ["pendiente"],
      label: "Walk-in reciente",
      mozoUser: pedroUser,
    },
    // T7 - Terraza, pareja a mitad de almuerzo
    {
      floorPlanTables: salonTables,
      tableIndex: 6,
      operationalStatus: "ocupada",
      openedMinsAgo: 35,
      itemCount: 4,
      comandaPattern: ["en_preparacion", "entregado"],
      label: "Familia García",
      mozoUser: pedroUser,
    },
    // T11 - Terraza, pidió cuenta
    {
      floorPlanTables: salonTables,
      tableIndex: 10,
      operationalStatus: "pidio_cuenta",
      openedMinsAgo: 78,
      itemCount: 4,
      comandaPattern: ["entregado"],
      label: "Mesa Pérez",
      mozoUser: diegoUser,
      billRequestedMinsAgo: 5,
    },
    // R02 - Restaurant, esperando la comida
    {
      floorPlanTables: salonTables,
      tableIndex: 16, // R02
      operationalStatus: "ocupada",
      openedMinsAgo: 20,
      itemCount: 3,
      comandaPattern: ["en_preparacion"],
      label: "Pareja López",
      mozoUser: pedroUser,
    },
    // R06 - Restaurant, comida servida, siguen comiendo
    {
      floorPlanTables: salonTables,
      tableIndex: 20, // R06
      operationalStatus: "ocupada",
      openedMinsAgo: 55,
      itemCount: 5,
      comandaPattern: ["entregado"],
      label: "Mesa de amigos",
      mozoUser: diegoUser,
    },
    // R16 - Mesa grande, grupo de 6 esperando postres
    {
      floorPlanTables: salonTables,
      tableIndex: 30, // R16
      operationalStatus: "ocupada",
      openedMinsAgo: 65,
      itemCount: 6,
      comandaPattern: ["entregado", "pendiente"],
      label: "Grupo Fernández",
      mozoUser: diegoUser,
    },
    // R19 - Mesa redonda, familia con chicos
    {
      floorPlanTables: salonTables,
      tableIndex: 33, // R19
      operationalStatus: "ocupada",
      openedMinsAgo: 40,
      itemCount: 4,
      comandaPattern: ["en_preparacion", "entregado"],
      label: "Familia Martínez",
      mozoUser: pedroUser,
    },
    // R09 - Restaurant costado, pidió cuenta
    {
      floorPlanTables: salonTables,
      tableIndex: 23, // R09
      operationalStatus: "pidio_cuenta",
      openedMinsAgo: 90,
      itemCount: 3,
      comandaPattern: ["entregado"],
      label: "Sra. González",
      mozoUser: diegoUser,
      billRequestedMinsAgo: 3,
    },
    // BAR2 - Bar, café rápido
    {
      floorPlanTables: salonTables,
      tableIndex: 41, // BAR2
      operationalStatus: "ocupada",
      openedMinsAgo: 12,
      itemCount: 2,
      comandaPattern: ["en_preparacion"],
      label: "Café de negocios",
      mozoUser: pedroUser,
    },
    // ── Salón 2 ──
    // 102 - Pareja almorzando
    {
      floorPlanTables: salon2Tables,
      tableIndex: 1,
      operationalStatus: "ocupada",
      openedMinsAgo: 28,
      itemCount: 5,
      comandaPattern: ["pendiente", "entregado"],
      label: "Cumpleaños salón 2",
      mozoUser: luciaUser,
    },
    // 112 - Mesa grande, evento
    {
      floorPlanTables: salon2Tables,
      tableIndex: 11, // 112
      operationalStatus: "ocupada",
      openedMinsAgo: 50,
      itemCount: 6,
      comandaPattern: ["en_preparacion", "entregado"],
      label: "Reunión de trabajo",
      mozoUser: luciaUser,
    },
    // 105 - Recién pidieron
    {
      floorPlanTables: salon2Tables,
      tableIndex: 4, // 105
      operationalStatus: "ocupada",
      openedMinsAgo: 10,
      itemCount: 3,
      comandaPattern: ["pendiente"],
      label: "Pareja nueva",
      mozoUser: luciaUser,
    },
  ];

  const liveTableIds: { table: (typeof allTables)[0]; orderId: string }[] = [];

  for (const def of liveTableDefs) {
    const table = def.floorPlanTables[def.tableIndex];
    if (!table) {
      console.error(`  ✗ Table index ${def.tableIndex} not found in floor plan`);
      continue;
    }

    const openedAt = minsAgo(def.openedMinsAgo);
    const orderProducts = pickRandomProducts(def.itemCount);
    const subtotalCents = orderProducts.reduce((s, p) => s + p.price_cents, 0);

    const orderRow: Record<string, unknown> = {
      business_id: BIZ,
      order_number: 0,
      customer_name: def.label,
      customer_phone: "+5493415550000",
      delivery_type: "dine_in",
      status: "preparing",
      subtotal_cents: subtotalCents,
      delivery_fee_cents: 0,
      discount_cents: 0,
      total_cents: subtotalCents,
      payment_method: "cash",
      payment_status: "pending",
      lifecycle_status: "open",
      table_id: table.id,
      mozo_id: def.mozoUser?.id ?? null,
      bill_requested_at: def.billRequestedMinsAgo ? minsAgo(def.billRequestedMinsAgo) : null,
      created_at: openedAt,
    };

    const { data: ord, error: ordErr } = await sb
      .from("orders")
      .insert(orderRow)
      .select("id")
      .single();

    if (ordErr) {
      console.error(`  ✗ Table ${table.label} "${def.label}": ${ordErr.message}`);
      continue;
    }

    // Insert order_items
    const items = orderProducts.map((p) => ({
      order_id: ord!.id,
      product_id: p.id,
      product_name: p.name,
      unit_price_cents: p.price_cents,
      quantity: 1,
      subtotal_cents: p.price_cents,
      station_id: resolveStationId(p),
      kitchen_status: "pending",
    }));

    const { data: insertedItems } = await sb
      .from("order_items")
      .insert(items)
      .select("id, station_id, product_id");

    // Attach modifiers to items that have modifier groups
    if (insertedItems) {
      for (const item of insertedItems) {
        if (!item.product_id) continue;
        const groups = modGroupsByProduct.get(item.product_id);
        if (!groups) continue;
        for (const g of groups) {
          const mods = modsByGroup.get(g.group_id);
          if (!mods?.length) continue;
          const chosen = rand(mods);
          await sb.from("order_item_modifiers").insert({
            order_item_id: item.id,
            modifier_id: chosen.id,
            modifier_name: chosen.name,
            price_delta_cents: chosen.price_delta_cents,
          });
        }
      }
    }

    // Create comandas grouped by station with the specified pattern
    if (insertedItems) {
      const byStation = new Map<string, string[]>();
      for (const item of insertedItems) {
        if (item.station_id) {
          const arr = byStation.get(item.station_id) ?? [];
          arr.push(item.id);
          byStation.set(item.station_id, arr);
        }
      }

      let stationIndex = 0;
      for (const [stationId, itemIds] of byStation) {
        // Cycle through the comanda pattern
        const status = def.comandaPattern[stationIndex % def.comandaPattern.length];
        stationIndex++;

        const { data: cmd } = await sb
          .from("comandas")
          .insert({
            order_id: ord!.id,
            station_id: stationId,
            batch: 1,
            status,
            emitted_at: openedAt,
            delivered_at: status === "entregado" ? minsAgo(def.openedMinsAgo - 10) : null,
          })
          .select("id")
          .single();

        if (cmd) {
          const ciRows = itemIds.map((oid) => ({
            comanda_id: cmd.id,
            order_item_id: oid,
          }));
          await sb.from("comanda_items").insert(ciRows);
        }
      }
    }

    // Update table state
    await sb
      .from("tables")
      .update({
        operational_status: def.operationalStatus,
        opened_at: openedAt,
        current_order_id: ord!.id,
        mozo_id: def.mozoUser?.id ?? null,
      })
      .eq("id", table.id);

    liveTableIds.push({ table, orderId: ord!.id });
    console.log(`  ✓ ${table.label} (${def.operationalStatus}) — "${def.label}" — mozo: ${def.mozoUser ? "assigned" : "none"}`);
  }

  console.log(`✓ ${liveTableIds.length} live tables created\n`);

  // ══════════════════════════════════════════════════════════════════════
  // FASE 5 — RESERVATIONS
  // ══════════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  FASE 5 — Reservations");
  console.log("═══════════════════════════════════════════════════════════\n");

  const today = todayArg();
  const slotDuration = 90; // minutes

  // Helper: find table by label
  function findTable(label: string): DBTable | undefined {
    return allTables.find((t) => t.label === label);
  }

  // Find the table that's occupied at index 6 (Familia García)
  const familiaTable = salonTables[6];

  // Today's reservations
  type ResDef = {
    status: string;
    slot: string;
    partySize: number;
    tableLabel: string;
    notes: string | null;
    source: string;
  };

  const todayReservations: ResDef[] = [
    { status: "confirmed", slot: "12:00", partySize: 4, tableLabel: "R01", notes: "Almuerzo empresa", source: "admin" },
    { status: "confirmed", slot: "13:00", partySize: 2, tableLabel: "R05", notes: "Romántico", source: "web" },
    { status: "confirmed", slot: "20:30", partySize: 6, tableLabel: "R11", notes: "Cumpleaños Martínez", source: "web" },
    { status: "confirmed", slot: "21:00", partySize: 4, tableLabel: "R03", notes: null, source: "web" },
    { status: "seated", slot: "12:30", partySize: 3, tableLabel: familiaTable?.label ?? "R06", notes: "Ya sentados", source: "admin" },
    { status: "no_show", slot: "12:00", partySize: 2, tableLabel: "R18", notes: "No vino", source: "web" },
  ];

  let resCount = 0;

  for (const res of todayReservations) {
    const table = findTable(res.tableLabel);
    const startsAt = argTimestamp(today, res.slot);
    const endsAt = new Date(new Date(startsAt).getTime() + slotDuration * 60_000).toISOString();

    const cust = customers ? rand(customers) : null;

    const { error: resErr } = await sb.from("reservations").insert({
      business_id: BIZ,
      table_id: table?.id ?? null,
      customer_name: cust?.name ?? `Reserva ${res.slot}`,
      customer_phone: cust?.phone ?? "+5493415550000",
      party_size: res.partySize,
      starts_at: startsAt,
      ends_at: endsAt,
      status: res.status,
      notes: res.notes,
      source: res.source,
    });

    if (resErr) {
      console.error(`  ✗ Today ${res.slot} ${res.status}: ${resErr.message}`);
    } else {
      console.log(`  ✓ Today ${res.slot} ${res.status.padEnd(10)} party ${res.partySize} @ ${res.tableLabel}`);
      resCount++;
    }
  }

  // Future reservations (next 3-7 days)
  const futureSlots = ["12:00", "13:00", "13:30", "20:30", "21:00", "21:30"];
  for (let i = 0; i < 5; i++) {
    const futureDate = daysFromNow(randInt(3, 7));
    const slot = rand(futureSlots);
    const table = rand(allTables);
    const cust = customers ? rand(customers) : null;
    const startsAt = argTimestamp(futureDate, slot);
    const endsAt = new Date(new Date(startsAt).getTime() + slotDuration * 60_000).toISOString();

    const { error: resErr } = await sb.from("reservations").insert({
      business_id: BIZ,
      table_id: table?.id ?? null,
      customer_name: cust?.name ?? `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`,
      customer_phone: cust?.phone ?? `+549341555${randInt(1000, 9999)}`,
      party_size: randInt(2, 8),
      starts_at: startsAt,
      ends_at: endsAt,
      status: "confirmed",
      notes: rand(RESERVATION_NOTES),
      source: Math.random() < 0.5 ? "web" : "admin",
    });

    if (!resErr) {
      console.log(`  ✓ Future ${futureDate.toISOString().slice(0, 10)} ${slot} @ ${table?.label}`);
      resCount++;
    }
  }

  // Historical reservations (last 30 days)
  for (let i = 0; i < 10; i++) {
    const pastDate = daysAgo(randInt(1, 30));
    const slot = rand(futureSlots);
    const table = rand(allTables);
    const cust = customers ? rand(customers) : null;
    const startsAt = argTimestamp(pastDate, slot);
    const endsAt = new Date(new Date(startsAt).getTime() + slotDuration * 60_000).toISOString();

    const histStatus = pickWeighted([
      { value: "completed", weight: 75 },
      { value: "cancelled", weight: 15 },
      { value: "no_show", weight: 10 },
    ]);

    const { error: resErr } = await sb.from("reservations").insert({
      business_id: BIZ,
      table_id: table?.id ?? null,
      customer_name: cust?.name ?? `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`,
      customer_phone: cust?.phone ?? `+549341555${randInt(1000, 9999)}`,
      party_size: randInt(2, 8),
      starts_at: startsAt,
      ends_at: endsAt,
      status: histStatus,
      notes: rand(RESERVATION_NOTES),
      source: Math.random() < 0.5 ? "web" : "admin",
      created_at: pastDate.toISOString(),
    });

    if (!resErr) resCount++;
  }

  console.log(`✓ ${resCount} reservations total (6 today + 5 future + 10 historical)\n`);

  // ══════════════════════════════════════════════════════════════════════
  // FASE 6 — CAJA
  // ══════════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  FASE 6 — Caja");
  console.log("═══════════════════════════════════════════════════════════\n");

  if (cajaId) {
    const encargadoId = sofiaUser?.id ?? adminUser?.id;

    if (encargadoId) {
      // Create a corte (arqueo)
      const { error: corteErr } = await sb.from("caja_cortes").insert({
        caja_id: cajaId,
        business_id: BIZ,
        encargado_id: encargadoId,
        expected_cash_cents: 5000000,
        closing_cash_cents: 5000000,
        difference_cents: 0,
        closing_notes: "Arqueo de apertura",
        created_at: hoursAgo(8),
      });
      console.log(corteErr ? `  ✗ Corte: ${corteErr.message}` : "  ✓ Corte (arqueo de apertura)");

      // Movimientos
      const movimientos = [
        { kind: "sangria", amount_cents: 200000, reason: "Cambio para mozo", hours: 5 },
        { kind: "sangria", amount_cents: 150000, reason: "Propinas acumuladas", hours: 3 },
        { kind: "ingreso", amount_cents: 50000, reason: "Venta kiosko", hours: 2 },
      ];

      for (const mov of movimientos) {
        const { error: movErr } = await sb.from("caja_movimientos").insert({
          caja_id: cajaId,
          business_id: BIZ,
          kind: mov.kind,
          amount_cents: mov.amount_cents,
          reason: mov.reason,
          created_by: encargadoId,
          created_at: hoursAgo(mov.hours),
        });
        console.log(movErr ? `  ✗ Mov: ${movErr.message}` : `  ✓ ${mov.kind}: $${(mov.amount_cents / 100).toLocaleString()} — ${mov.reason}`);
      }
    } else {
      console.log("  ✗ No encargado user found for caja operations");
    }
  }

  console.log("");

  // ══════════════════════════════════════════════════════════════════════
  // FASE 7 — CLOCK ENTRIES (fichaje)
  // ══════════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  FASE 7 — Clock entries (fichaje)");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Team members with PINs
  const teamWithPins = teamUsers.filter((u) => u.pin !== null);
  console.log(`  Team members with PINs: ${teamWithPins.length}`);

  let clockCount = 0;

  for (const member of teamWithPins) {
    // Last 7 days: full shifts
    for (let day = 1; day <= 7; day++) {
      const shiftDate = daysAgo(day);
      const clockInHour = randInt(8, 10);
      const shiftLength = randInt(7, 9); // hours

      shiftDate.setHours(clockInHour, randInt(0, 30), 0, 0);
      const clockIn = shiftDate.toISOString();

      const clockOutDate = new Date(shiftDate.getTime() + shiftLength * 3600_000);
      const clockOut = clockOutDate.toISOString();

      const { error: ceErr } = await sb.from("clock_entries").insert({
        business_id: BIZ,
        user_id: member.user_id,
        clock_in: clockIn,
        clock_out: clockOut,
      });

      if (!ceErr) clockCount++;
    }

    // Today: first 3 employees have open shifts
    if (teamWithPins.indexOf(member) < 3) {
      const todayStart = todayArg();
      const startHour = 9 + teamWithPins.indexOf(member); // 9, 10, 11
      todayStart.setHours(startHour, randInt(0, 15), 0, 0);

      const { error: ceErr } = await sb.from("clock_entries").insert({
        business_id: BIZ,
        user_id: member.user_id,
        clock_in: todayStart.toISOString(),
        clock_out: null, // open shift
      });

      if (!ceErr) clockCount++;
    }
  }

  console.log(`✓ ${clockCount} clock entries created\n`);

  // ══════════════════════════════════════════════════════════════════════
  // FASE 8 — STOCK REFRESH
  // ══════════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  FASE 8 — Stock refresh");
  console.log("═══════════════════════════════════════════════════════════\n");

  // Get products with track_stock = true
  const trackStockProducts = products.filter((p) => p.track_stock);
  let stockRefreshCount = 0;

  for (const p of trackStockProducts) {
    // Find or create stock_item
    const { data: existing } = await sb
      .from("stock_items")
      .select("id, current_qty")
      .eq("business_id", BIZ)
      .eq("product_id", p.id)
      .single();

    let stockItemId = existing?.id;

    if (!stockItemId) {
      const qty = Math.random() < 0.75 ? randInt(12, 48) : randInt(1, 3);
      const { data: newSi } = await sb
        .from("stock_items")
        .insert({
          business_id: BIZ,
          product_id: p.id,
          current_qty: qty,
          min_qty: 3,
          unit: "unidad",
        })
        .select("id, current_qty")
        .single();
      stockItemId = newSi?.id;

      if (stockItemId) {
        // Create initial ingreso movimiento
        await sb.from("stock_movimientos").insert({
          stock_item_id: stockItemId,
          business_id: BIZ,
          kind: "ingreso",
          qty: newSi!.current_qty,
          reason: "Stock inicial",
          created_by: adminUser?.id ?? null,
        });
        stockRefreshCount++;
      }
    } else {
      // Reset existing to random quantity
      const qty = Math.random() < 0.75 ? randInt(12, 48) : randInt(1, 3);
      await sb.from("stock_items").update({ current_qty: qty }).eq("id", stockItemId);

      // Create ingreso movimiento for the reset
      await sb.from("stock_movimientos").insert({
        stock_item_id: stockItemId,
        business_id: BIZ,
        kind: "ingreso",
        qty,
        reason: "Stock inicial",
        created_by: adminUser?.id ?? null,
      });
      stockRefreshCount++;
    }
  }

  console.log(`✓ ${stockRefreshCount} stock items refreshed\n`);

  // ══════════════════════════════════════════════════════════════════════
  // FASE 9 — PROMO CODES
  // ══════════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  FASE 9 — Promo codes");
  console.log("═══════════════════════════════════════════════════════════\n");

  const promoCodes = [
    {
      business_id: BIZ,
      code: "GOLF10",
      description: "10% de descuento",
      discount_type: "percentage",
      discount_value: 10,
      min_order_cents: 0,
      max_uses: 100,
      uses_count: 23,
      is_active: true,
      valid_from: null,
      valid_until: null,
    },
    {
      business_id: BIZ,
      code: "ENVIOGRATIS",
      description: "Envío gratis",
      discount_type: "free_shipping",
      discount_value: 0,
      min_order_cents: 0,
      max_uses: 50,
      uses_count: 8,
      is_active: true,
      valid_from: null,
      valid_until: null,
    },
  ];

  for (const pc of promoCodes) {
    const { error: pcErr } = await sb.from("promo_codes").insert(pc);
    console.log(pcErr ? `  ✗ ${pc.code}: ${pcErr.message}` : `  ✓ ${pc.code} — ${pc.description}`);
  }

  console.log("");

  // ══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  RESUMEN");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Customers:          15`);
  console.log(`  Historical orders:  ${historicalCount}`);
  console.log(`  Today orders:       ${todayOrders.length}`);
  console.log(`  Live tables:        ${liveTableIds.length}`);
  console.log(`  Reservations:       ${resCount}`);
  console.log(`  Caja movimientos:   3`);
  console.log(`  Clock entries:      ${clockCount}`);
  console.log(`  Stock items:        ${stockRefreshCount}`);
  console.log(`  Promo codes:        ${promoCodes.length}`);
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  ✓ seed-operativo complete");
  console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("✗ Fatal error:", err);
  process.exit(1);
});
