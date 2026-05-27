/**
 * Seed de demo — crea un negocio genérico con toda la data para mostrar la plataforma.
 *
 * A diferencia de seed-all.ts (que requiere un business existente), este script
 * CREA el business si no existe.
 *
 * Fases:
 *   0. Business (crea o reutiliza el negocio demo)
 *   1. Catálogo (stations, super_categories, categories, products)
 *   2. Infraestructura física (floor plans, mesas, reservation settings)
 *   3. Equipo (auth users + business_users + PINs + fichadas)
 *   3b. Menús del día (NUEVO — no existe en seed-all)
 *   4. Caja (caja + corte + movimientos)
 *   5. Estado operativo (mesas ocupadas, orders dine_in, comandas)
 *   6. Historial (customers, orders pasadas, reservas)
 *
 * Uso:
 *   npx tsx scripts/seed-demo.ts           # crea todo desde cero
 *   npx tsx scripts/seed-demo.ts --reset   # limpia operativo y re-seed
 *
 * Requiere: .env.local con NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  slugify, rand, randInt, pickWeighted, minsAgo, chunk,
  STATIONS, SUPER_CATEGORIES, CATEGORIES, PRODUCTS,
  SALON_TABLES, TERRAZA_TABLES, RESERVATION_SCHEDULE,
  TEAM, TEAM_PASSWORD,
  FIRST_NAMES, LAST_NAMES, STREETS, RESERVATION_NOTES,
} from "./seed-data";

config({ path: ".env.local" });

const RESET = process.argv.includes("--reset");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════════════════════════════════════

const DEMO_SLUG = "demo";
const DEMO_BUSINESS = {
  slug: DEMO_SLUG,
  name: "La Terraza Demo",
  timezone: "America/Argentina/Buenos_Aires",
  currency: "ARS",
  phone: "+5493415551234",
  email: "demo@pedidos.com",
  address: "Pellegrini 1234, Rosario",
  settings: {
    primary_color: "#16a34a",
    font_heading: "dm-sans",
    radius_scale: "md",
    shadow_scale: "md",
    density: "comfortable",
  },
  delivery_fee_cents: 80000,
  min_order_cents: 300000,
  estimated_delivery_minutes: 40,
  is_active: true,
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n━━━ Seed demo → "${DEMO_SLUG}" ${RESET ? "(RESET)" : ""} ━━━\n`);

  let biz: string;

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 0 — BUSINESS
  // ══════════════════════════════════════════════════════════════════════════
  if (!RESET) {
    const { data: existing } = await supabase
      .from("businesses").select("id").eq("slug", DEMO_SLUG).maybeSingle();
    if (existing) {
      biz = existing.id;
      console.log(`✓ Business existente: ${DEMO_SLUG} (${biz})`);
    } else {
      const { data, error } = await supabase
        .from("businesses").insert(DEMO_BUSINESS).select("id").single();
      if (error || !data) { console.error("✗ Error creando business:", error?.message); process.exit(1); }
      biz = data.id;
      console.log(`✓ Business creado: ${DEMO_BUSINESS.name} (${biz})`);
    }
  } else {
    // Reset mode: find the business
    const { data } = await supabase
      .from("businesses").select("id").eq("slug", DEMO_SLUG).maybeSingle();
    if (!data) { console.error(`✗ Negocio "${DEMO_SLUG}" no existe.`); process.exit(1); }
    biz = data.id;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESET (solo operativo)
  // ══════════════════════════════════════════════════════════════════════════
  if (RESET) {
    console.log(`\n[reset] limpiando operativo...`);
    await supabase.from("stock_movimientos").delete().eq("business_id", biz);
    await supabase.from("stock_items").delete().eq("business_id", biz);
    await supabase.from("products").update({ track_stock: false }).eq("business_id", biz);
    await supabase.from("payments").delete().eq("business_id", biz);
    await supabase.from("caja_movimientos").delete().eq("business_id", biz);
    await supabase.from("caja_cortes").delete().eq("business_id", biz);
    await supabase.from("clock_entries").delete().eq("business_id", biz);
    // Daily menus cleanup
    const { data: dmMenus } = await supabase.from("daily_menus").select("id").eq("business_id", biz);
    if (dmMenus && dmMenus.length > 0) {
      await supabase.from("daily_menu_components").delete().in("menu_id", dmMenus.map((m) => m.id));
    }
    await supabase.from("daily_menus").delete().eq("business_id", biz);
    const { data: ordersToDel } = await supabase.from("orders").select("id").eq("business_id", biz);
    if (ordersToDel && ordersToDel.length > 0) {
      await supabase.from("comandas").delete().in("order_id", ordersToDel.map((o) => o.id));
    }
    // Reset mesas
    const { data: fps } = await supabase.from("floor_plans").select("id").eq("business_id", biz);
    if (fps && fps.length > 0) {
      const { data: tbl } = await supabase.from("tables").select("id").in("floor_plan_id", fps.map((f) => f.id));
      if (tbl && tbl.length > 0) {
        await supabase.from("tables")
          .update({ current_order_id: null, opened_at: null, operational_status: "libre", mozo_id: null })
          .in("id", tbl.map((t) => t.id));
      }
    }
    await supabase.from("orders").delete().eq("business_id", biz);
    await supabase.from("reservations").delete().eq("business_id", biz);
    await supabase.from("customers").delete().eq("business_id", biz);
    console.log(`  ✓ operativo limpio`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 0b — HORARIOS (business_hours) — abierto 7 días
  // ══════════════════════════════════════════════════════════════════════════
  if (!RESET) {
    await supabase.from("business_hours").delete().eq("business_id", biz);
    const hourRows = [];
    for (let dow = 0; dow < 7; dow++) {
      // Mediodía: 11:30 – 15:30 / Noche: 19:30 – 01:00
      hourRows.push(
        { business_id: biz, day_of_week: dow, opens_at: "11:30:00", closes_at: "15:30:00" },
        { business_id: biz, day_of_week: dow, opens_at: "19:30:00", closes_at: "23:59:59" },
      );
    }
    await supabase.from("business_hours").insert(hourRows);
    console.log(`  ✓ business_hours (7 días, mediodía + noche)`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 1 — CATÁLOGO
  // ══════════════════════════════════════════════════════════════════════════
  if (!RESET) {
    console.log(`\n═══ FASE 1: Catálogo ═══`);

    // Limpiar carta existente
    console.log("Limpiando catálogo existente...");
    await supabase.from("products").delete().eq("business_id", biz);
    await supabase.from("categories").delete().eq("business_id", biz);
    await supabase.from("super_categories").delete().eq("business_id", biz);
    await supabase.from("stations").delete().eq("business_id", biz);

    // Stations
    console.log("Creando stations...");
    const stationIdMap = new Map<string, string>();
    for (const s of STATIONS) {
      const { data } = await supabase
        .from("stations")
        .upsert({ business_id: biz, name: s.name, sort_order: s.sort_order, is_active: true }, { onConflict: "business_id,name" })
        .select("id").single();
      if (data) stationIdMap.set(s.name, data.id);
    }
    console.log(`  ✓ ${stationIdMap.size} stations`);

    // Super-categories
    console.log("Creando super_categories...");
    const superCatIdMap = new Map<string, string>();
    for (let i = 0; i < SUPER_CATEGORIES.length; i++) {
      const sc = SUPER_CATEGORIES[i]!;
      const { data } = await supabase
        .from("super_categories")
        .upsert({ business_id: biz, name: sc.name, slug: sc.slug, sort_order: i, icon: sc.icon, color: sc.color, is_active: true }, { onConflict: "business_id,slug" })
        .select("id").single();
      if (data) superCatIdMap.set(sc.name, data.id);
    }
    console.log(`  ✓ ${superCatIdMap.size} super_categories`);

    // Categories
    console.log("Creando categories...");
    const categoryIdMap = new Map<string, string>();
    for (let i = 0; i < CATEGORIES.length; i++) {
      const cat = CATEGORIES[i]!;
      const slug = slugify(cat.name);
      const stationId = cat.default_station ? stationIdMap.get(cat.default_station) ?? null : null;
      const superCategoryId = superCatIdMap.get(cat.super_category) ?? null;
      const { data } = await supabase
        .from("categories")
        .upsert({ business_id: biz, name: cat.name, slug, sort_order: i, is_active: true, station_id: stationId, super_category_id: superCategoryId }, { onConflict: "business_id,slug" })
        .select("id").single();
      if (data) categoryIdMap.set(cat.name, data.id);
    }
    console.log(`  ✓ ${categoryIdMap.size} categories`);

    // Products
    console.log(`Creando ${PRODUCTS.length} productos...`);
    let prodOk = 0;
    const slugCounters = new Map<string, number>();
    for (let i = 0; i < PRODUCTS.length; i++) {
      const p = PRODUCTS[i]!;
      const baseSlug = slugify(p.name);
      const existing = slugCounters.get(baseSlug) ?? 0;
      slugCounters.set(baseSlug, existing + 1);
      const slug = existing > 0 ? `${baseSlug}-${existing + 1}` : baseSlug;
      const categoryId = categoryIdMap.get(p.category) ?? null;
      const stationId = p.station ? stationIdMap.get(p.station) ?? null : null;
      const { error } = await supabase.from("products").upsert(
        { business_id: biz, category_id: categoryId, name: p.name, slug, price_cents: p.price_cents, is_active: true, is_available: true, sort_order: i, station_id: stationId },
        { onConflict: "business_id,slug" },
      );
      if (!error) prodOk++;
    }
    console.log(`  ✓ ${prodOk} productos`);
  }

  // Leer productos + stations del DB para fases siguientes
  const { data: productRows } = await supabase
    .from("products").select("id, name, price_cents, category_id, station_id")
    .eq("business_id", biz).eq("is_active", true);
  if (!productRows || productRows.length === 0) {
    console.error("✗ Sin productos en DB.");
    process.exit(1);
  }

  const { data: stationsDB } = await supabase
    .from("stations").select("id, name").eq("business_id", biz);
  const stationIdByName = new Map<string, string>();
  for (const s of stationsDB ?? []) stationIdByName.set(s.name, s.id);

  // Resolve station_id for each product (product override > category default)
  const { data: catsDB } = await supabase
    .from("categories").select("id, station_id").eq("business_id", biz);
  const stationByCategory = new Map<string, string | null>();
  for (const c of catsDB ?? []) stationByCategory.set(c.id, c.station_id as string | null);

  type PRow = { id: string; name: string; price_cents: number; station_id: string | null };
  const resolvedProducts: PRow[] = productRows.map((p) => ({
    id: p.id,
    name: p.name,
    price_cents: Number(p.price_cents),
    station_id: (p.station_id as string | null) ?? (p.category_id ? stationByCategory.get(p.category_id) ?? null : null),
  }));

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 2 — INFRAESTRUCTURA FÍSICA
  // ══════════════════════════════════════════════════════════════════════════
  if (!RESET) {
    console.log(`\n═══ FASE 2: Infraestructura física ═══`);

    // Floor plan "Salón"
    let salonId: string;
    const { data: existingSalon } = await supabase
      .from("floor_plans").select("id").eq("business_id", biz).eq("name", "Salón principal").maybeSingle();
    if (existingSalon) {
      salonId = existingSalon.id;
    } else {
      const { data } = await supabase
        .from("floor_plans").insert({ business_id: biz, name: "Salón principal", width: 1000, height: 700 })
        .select("id").single();
      salonId = data!.id;
    }
    for (const t of SALON_TABLES) {
      const { data: ex } = await supabase.from("tables").select("id").eq("floor_plan_id", salonId).eq("label", t.label).maybeSingle();
      if (!ex) await supabase.from("tables").insert({ ...t, floor_plan_id: salonId, status: "active", operational_status: "libre" });
    }
    console.log(`  ✓ Salón: ${SALON_TABLES.length} mesas`);

    // Floor plan "Terraza"
    let terrazaId: string;
    const { data: existingTerraza } = await supabase
      .from("floor_plans").select("id").eq("business_id", biz).eq("name", "Terraza").maybeSingle();
    if (existingTerraza) {
      terrazaId = existingTerraza.id;
    } else {
      const { data } = await supabase
        .from("floor_plans").insert({ business_id: biz, name: "Terraza", width: 700, height: 500 })
        .select("id").single();
      terrazaId = data!.id;
    }
    for (const t of TERRAZA_TABLES) {
      const { data: ex } = await supabase.from("tables").select("id").eq("floor_plan_id", terrazaId).eq("label", t.label).maybeSingle();
      if (!ex) await supabase.from("tables").insert({ ...t, floor_plan_id: terrazaId, status: "active", operational_status: "libre" });
    }
    console.log(`  ✓ Terraza: ${TERRAZA_TABLES.length} mesas`);

    // Reservation settings
    await supabase.from("reservation_settings").upsert({
      business_id: biz, slot_duration_min: 90, buffer_min: 15,
      lead_time_min: 60, advance_days_max: 30, max_party_size: 12,
      schedule: RESERVATION_SCHEDULE,
    }, { onConflict: "business_id" });
    console.log(`  ✓ reservation_settings`);
  }

  // Collect all tables
  const { data: allFps } = await supabase.from("floor_plans").select("id, name").eq("business_id", biz);
  const fpIds = (allFps ?? []).map((f) => f.id);
  const { data: allTablesRaw } = await supabase
    .from("tables").select("id, label, seats, floor_plan_id")
    .in("floor_plan_id", fpIds).eq("status", "active");
  type TRow = { id: string; label: string; seats: number; floor_plan_id: string };
  const allTables: TRow[] = (allTablesRaw ?? []) as TRow[];
  const terrazaFpId = allFps?.find((f) => f.name === "Terraza")?.id;
  const salonTables = allTables.filter((t) => t.floor_plan_id !== terrazaFpId);
  const terrazaTables = allTables.filter((t) => t.floor_plan_id === terrazaFpId);

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 3 — EQUIPO
  // ══════════════════════════════════════════════════════════════════════════
  if (!RESET) {
    console.log(`\n═══ FASE 3: Equipo ═══`);

    const listRes = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const existingAuth: { id: string; email?: string | null }[] =
      (listRes.data?.users ?? []) as { id: string; email?: string | null }[];

    for (const m of TEAM) {
      let userId = existingAuth.find((u) => u.email?.toLowerCase() === m.email.toLowerCase())?.id ?? null;
      if (!userId) {
        const { data, error } = await supabase.auth.admin.createUser({
          email: m.email, password: TEAM_PASSWORD, email_confirm: true,
          user_metadata: { full_name: m.name },
        });
        if (error || !data.user) { console.error(`  ✗ ${m.email}:`, error?.message); continue; }
        userId = data.user.id;
      }
      await supabase.from("users").upsert({ id: userId, email: m.email }, { onConflict: "id" });
      await supabase.from("business_users").upsert(
        { business_id: biz, user_id: userId, role: m.role, full_name: m.name, pin: m.pin },
        { onConflict: "business_id,user_id" },
      );
      console.log(`  ✓ ${m.role.padEnd(10)} ${m.email}${m.pin ? ` (PIN ${m.pin})` : ""}`);
    }
  }

  // Resolve team IDs
  const teamIdsByEmail = new Map<string, string>();
  for (const m of TEAM) {
    const { data } = await supabase.from("business_users").select("user_id")
      .eq("business_id", biz).eq("full_name", m.name).maybeSingle();
    if (data) teamIdsByEmail.set(m.email, data.user_id);
  }
  const encargadaId = teamIdsByEmail.get("sofia@demo.test")!;
  const mozoIds = ["pedro@demo.test", "lucia@demo.test", "diego@demo.test"]
    .map((e) => teamIdsByEmail.get(e)!).filter(Boolean);

  // Assign mozos to tables
  if (mozoIds.length >= 3 && salonTables.length > 0) {
    const tablesPerMozo = Math.ceil(salonTables.length / 2);
    for (let i = 0; i < salonTables.length; i++) {
      const mozoId = i < tablesPerMozo ? mozoIds[0] : mozoIds[2];
      await supabase.from("tables").update({ mozo_id: mozoId }).eq("id", salonTables[i]!.id);
    }
    for (const t of terrazaTables) {
      await supabase.from("tables").update({ mozo_id: mozoIds[1] }).eq("id", t.id);
    }
    console.log(`  ✓ mozos asignados a mesas`);
  }

  // ── Fichadas de ejemplo (clock_entries) ──────────────────────────────────
  // Todos los empleados con PIN fichan. Generamos 7 días de historia + hoy abierta.
  const allPinUsers = TEAM.filter((m) => m.pin !== null);
  const allPinUserIds = allPinUsers.map((m) => teamIdsByEmail.get(m.email)!).filter(Boolean);

  if (allPinUserIds.length > 0) {
    // Limpiar clock_entries previas del seed
    await supabase.from("clock_entries").delete().eq("business_id", biz);

    const clockRows: {
      business_id: string; user_id: string;
      clock_in: string; clock_out: string | null; notes: string | null;
    }[] = [];

    // Últimos 7 días completos
    for (let d = 7; d >= 1; d--) {
      for (const uid of allPinUserIds) {
        const base = new Date();
        base.setDate(base.getDate() - d);
        // Jornada: entre 8-10am a 16-19pm, con variación
        const inHour = 8 + Math.floor(Math.random() * 3);
        const inMin = randInt(0, 30);
        const shiftHours = 7 + Math.floor(Math.random() * 3); // 7-9h shifts
        const clockIn = new Date(base);
        clockIn.setHours(inHour, inMin, 0, 0);
        const clockOut = new Date(clockIn.getTime() + shiftHours * 3600_000 + randInt(0, 30) * 60_000);

        clockRows.push({
          business_id: biz, user_id: uid,
          clock_in: clockIn.toISOString(),
          clock_out: clockOut.toISOString(),
          notes: null,
        });
      }
    }

    // Hoy: algunos ya ficharon entrada (sin salida = turno abierto)
    const todayOpenCount = Math.min(3, allPinUserIds.length);
    for (let i = 0; i < todayOpenCount; i++) {
      const clockIn = new Date();
      clockIn.setHours(9 + i, randInt(0, 15), 0, 0);
      if (clockIn > new Date()) continue; // no fichar en el futuro
      clockRows.push({
        business_id: biz, user_id: allPinUserIds[i]!,
        clock_in: clockIn.toISOString(),
        clock_out: null,
        notes: null,
      });
    }

    // Insertar en batches
    for (const batch of chunk(clockRows, 50)) {
      await supabase.from("clock_entries").insert(batch);
    }
    console.log(`  ✓ ${clockRows.length} fichadas (${allPinUsers.length} empleados × ~8 días)`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 3b — MENÚS DEL DÍA
  // ══════════════════════════════════════════════════════════════════════════
  if (!RESET) {
    console.log(`\n═══ FASE 3b: Menús del día ═══`);

    // Limpiar menús existentes
    const { data: existingMenus } = await supabase.from("daily_menus").select("id").eq("business_id", biz);
    if (existingMenus && existingMenus.length > 0) {
      await supabase.from("daily_menu_components").delete().in("menu_id", existingMenus.map((m) => m.id));
    }
    await supabase.from("daily_menus").delete().eq("business_id", biz);

    const menus = [
      {
        name: "Menú Ejecutivo",
        slug: "menu-ejecutivo",
        description: "Entrada + principal + bebida + postre. De lunes a viernes al mediodía.",
        price_cents: 3500_000,
        available_days: [1, 2, 3, 4, 5], // lun-vie
        components: [
          { label: "Empanadas (2 un.)", description: "Carne cortada a cuchillo", sort_order: 0 },
          { label: "Milanesa napolitana con puré", description: "Entrecot rebozado, muzzarella gratinada", sort_order: 1 },
          { label: "Gaseosa 500ml", description: "Coca-Cola, Sprite o Fanta", sort_order: 2 },
          { label: "Flan con dulce de leche", description: null, sort_order: 3 },
        ],
      },
      {
        name: "Menú del Sábado",
        slug: "menu-sabado",
        description: "Parrilla completa para el fin de semana.",
        price_cents: 4500_000,
        available_days: [6], // sábado
        components: [
          { label: "Provoleta", description: "Con orégano y aceite de oliva", sort_order: 0 },
          { label: "Asado de tira con ensalada mixta", description: "Cocción lenta a la brasa", sort_order: 1 },
          { label: "Copa de vino tinto", description: "Malbec de la casa", sort_order: 2 },
          { label: "Tiramisú", description: "Casero, con mascarpone", sort_order: 3 },
        ],
      },
    ];

    for (const menu of menus) {
      const { components, ...menuData } = menu;
      const { data: inserted } = await supabase
        .from("daily_menus")
        .insert({ ...menuData, business_id: biz, is_active: true, is_available: true, sort_order: 0 })
        .select("id")
        .single();
      if (!inserted) continue;
      await supabase.from("daily_menu_components").insert(
        components.map((c) => ({ ...c, menu_id: inserted.id })),
      );
      console.log(`  ✓ ${menu.name} (${components.length} componentes)`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 3c — STOCK DE BEBIDAS
  // ══════════════════════════════════════════════════════════════════════════
  {
    console.log(`\n═══ FASE 3c: Stock de bebidas ═══`);

    // Clean previous stock data
    await supabase.from("stock_movimientos").delete().eq("business_id", biz);
    await supabase.from("stock_items").delete().eq("business_id", biz);
    await supabase.from("products").update({ track_stock: false }).eq("business_id", biz);

    // Categories whose products should be tracked
    const STOCK_CATEGORIES = ["Cervezas", "Espumantes", "Whiskys", "Aperitivos", "Vinos"];

    const { data: stockCats } = await supabase
      .from("categories").select("id, name").eq("business_id", biz).in("name", STOCK_CATEGORIES);

    const stockCatIds = new Set((stockCats ?? []).map((c) => c.id));

    const trackableProducts = productRows.filter((p) => stockCatIds.has(p.category_id));

    let stockOk = 0;
    for (const p of trackableProducts) {
      await supabase.from("products").update({ track_stock: true }).eq("id", p.id);

      // Random initial stock: most between 12-48, a few low (1-3) for alerts
      const isLow = Math.random() < 0.25;
      const currentQty = isLow ? randInt(1, 3) : randInt(12, 48);
      const minQty = isLow ? 5 : randInt(3, 6);

      const { data: si } = await supabase
        .from("stock_items")
        .insert({ business_id: biz, product_id: p.id, current_qty: currentQty, min_qty: minQty })
        .select("id")
        .single();

      if (si) {
        // Seed an initial ingreso movement
        await supabase.from("stock_movimientos").insert({
          stock_item_id: si.id,
          business_id: biz,
          kind: "ingreso",
          qty: currentQty,
          reason: "Stock inicial",
          created_by: encargadaId,
        });
        stockOk++;
      }
    }
    console.log(`  ✓ ${stockOk} productos con stock trackeado`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 4 — CAJA
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`\n═══ FASE 4: Caja ═══`);

  let { data: caja } = await supabase
    .from("cajas").select("id").eq("business_id", biz).eq("name", "Caja Principal").maybeSingle();
  if (!caja) {
    const { data } = await supabase
      .from("cajas").insert({ business_id: biz, name: "Caja Principal", is_active: true, sort_order: 0 })
      .select("id").single();
    caja = data!;
  }

  // Corte de ejemplo (simula arqueo previo)
  const { data: existingCorte } = await supabase
    .from("caja_cortes").select("id").eq("caja_id", caja.id).limit(1).maybeSingle();
  if (!existingCorte) {
    await supabase.from("caja_cortes").insert({
      caja_id: caja.id, business_id: biz, performed_by: encargadaId,
      expected_cash_cents: 5000_000, closing_cash_cents: 5000_000,
      difference_cents: 0, closing_notes: "Arqueo de apertura de jornada",
      created_at: minsAgo(480),
    });
    console.log(`  ✓ corte inicial ($50.000)`);
  } else {
    console.log(`  · corte ya existía`);
  }

  // Movimientos de ejemplo
  const { data: existingMovs } = await supabase
    .from("caja_movimientos").select("id").eq("caja_id", caja.id).limit(1).maybeSingle();
  if (!existingMovs) {
    await supabase.from("caja_movimientos").insert([
      { business_id: biz, caja_id: caja.id, kind: "sangria", amount_cents: 200_000, reason: "Cambio para mozo", created_by: encargadaId, created_at: minsAgo(300) },
      { business_id: biz, caja_id: caja.id, kind: "sangria", amount_cents: 150_000, reason: "Propinas acumuladas", created_by: encargadaId, created_at: minsAgo(180) },
      { business_id: biz, caja_id: caja.id, kind: "ingreso", amount_cents: 50_000, reason: "Venta kiosko", created_by: encargadaId, created_at: minsAgo(120) },
    ]);
    console.log(`  ✓ 3 movimientos de ejemplo`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 5 — ESTADO OPERATIVO
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`\n═══ FASE 5: Estado operativo ═══`);

  type MesaSetup = {
    table: TRow; state: "ocupada" | "pidio_cuenta";
    minutesAgo: number; itemCount: number;
    comandaPattern: ("pendiente" | "en_preparacion" | "listo" | "entregado")[];
    askedBill?: boolean; customerName: string; mozoIdx: number;
  };

  const setups: MesaSetup[] = [];
  if (salonTables[2]) setups.push({
    table: salonTables[2], state: "ocupada", minutesAgo: 5, itemCount: 3,
    comandaPattern: ["pendiente"], customerName: "Walk-in reciente", mozoIdx: 0,
  });
  if (salonTables[6]) setups.push({
    table: salonTables[6], state: "ocupada", minutesAgo: 35, itemCount: 4,
    comandaPattern: ["en_preparacion", "listo"], customerName: "Familia García", mozoIdx: 0,
  });
  if (salonTables[10]) setups.push({
    table: salonTables[10], state: "pidio_cuenta", minutesAgo: 78, itemCount: 4,
    comandaPattern: ["entregado", "entregado"], askedBill: true,
    customerName: "Mesa Pérez", mozoIdx: 2,
  });
  if (terrazaTables[1]) setups.push({
    table: terrazaTables[1], state: "ocupada", minutesAgo: 28, itemCount: 5,
    comandaPattern: ["pendiente", "entregado"], customerName: "Cumpleaños terraza", mozoIdx: 1,
  });

  for (const s of setups) {
    const openedAt = minsAgo(s.minutesAgo);
    const mozoId = mozoIds[s.mozoIdx] ?? null;

    // Limpiar order previa si existe
    const { data: prevOpen } = await supabase
      .from("orders").select("id").eq("business_id", biz)
      .eq("table_id", s.table.id).eq("lifecycle_status", "open").maybeSingle();
    if (prevOpen) {
      await supabase.from("comandas").delete().eq("order_id", prevOpen.id);
      await supabase.from("payments").delete().eq("order_id", prevOpen.id);
      await supabase.from("orders").delete().eq("id", prevOpen.id);
    }
    await supabase.from("tables")
      .update({ current_order_id: null, opened_at: null, operational_status: "libre" })
      .eq("id", s.table.id);

    // Items cubriendo distintas stations
    const stationNames = ["Cocina", "Parrilla", "Fritera", "Postres y Café"];
    const chosen: PRow[] = [];
    for (const sn of stationNames) {
      if (chosen.length >= s.itemCount) break;
      const stId = stationIdByName.get(sn);
      const candidates = resolvedProducts.filter((p) => p.station_id === stId);
      if (candidates.length > 0) chosen.push(rand(candidates));
    }
    while (chosen.length < s.itemCount) chosen.push(rand(resolvedProducts));

    const items = chosen.map((p) => {
      const qty = randInt(1, 2);
      return {
        product_id: p.id, product_name: p.name,
        unit_price_cents: p.price_cents, quantity: qty,
        subtotal_cents: p.price_cents * qty, station_id: p.station_id,
        loaded_by: mozoId,
      };
    });
    const subtotal = items.reduce((acc, it) => acc + it.subtotal_cents, 0);

    const { data: order, error: oErr } = await supabase
      .from("orders").insert({
        order_number: 0, business_id: biz, customer_name: s.customerName,
        customer_phone: "+5493415559999", delivery_type: "dine_in",
        table_id: s.table.id, mozo_id: mozoId,
        status: "preparing", lifecycle_status: "open",
        subtotal_cents: subtotal, delivery_fee_cents: 0,
        discount_cents: 0, total_cents: subtotal,
        payment_method: "cash_on_delivery", payment_status: "pending",
        created_at: openedAt, updated_at: openedAt,
        bill_requested_at: s.askedBill ? minsAgo(5) : null,
      }).select("id").single();
    if (oErr || !order) { console.error(`  ✗ order ${s.table.label}:`, oErr?.message); continue; }

    const { data: insertedItems } = await supabase
      .from("order_items").insert(items.map((it) => ({ ...it, order_id: order.id })))
      .select("id, station_id");
    if (!insertedItems) continue;

    // Comandas agrupadas por station
    const itemsByStation = new Map<string, typeof insertedItems>();
    for (const it of insertedItems) {
      const sid = it.station_id as string | null;
      if (!sid) continue;
      const prev = itemsByStation.get(sid) ?? [];
      prev.push(it);
      itemsByStation.set(sid, prev);
    }

    let batch = 0;
    for (const stId of Array.from(itemsByStation.keys())) {
      batch++;
      const stItems = itemsByStation.get(stId)!;
      const status = s.comandaPattern[(batch - 1) % s.comandaPattern.length] ?? "pendiente";
      const deliveredAt = status === "entregado" ? minsAgo(3) : null;

      const { data: comanda } = await supabase.from("comandas").insert({
        order_id: order.id, station_id: stId, batch, status,
        emitted_at: openedAt, delivered_at: deliveredAt,
      }).select("id").single();
      if (!comanda) continue;

      await supabase.from("comanda_items").insert(
        stItems.map((it) => ({ comanda_id: comanda.id, order_item_id: it.id })),
      );

      const kitchenStatus = status === "pendiente" ? "pending"
        : status === "en_preparacion" ? "preparing"
        : status === "listo" ? "ready" : "delivered";
      await supabase.from("order_items")
        .update({ kitchen_status: kitchenStatus })
        .in("id", stItems.map((it) => it.id));
    }

    await supabase.from("tables").update({
      operational_status: s.state, opened_at: openedAt,
      current_order_id: order.id, mozo_id: mozoId,
    }).eq("id", s.table.id);

    console.log(`  ✓ ${s.table.label.padEnd(4)} ${s.state.padEnd(13)} ${s.customerName}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FASE 6 — HISTORIAL
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`\n═══ FASE 6: Historial ═══`);

  // Customers
  console.log("Creando customers...");
  const phoneSet = new Set<string>();
  const customerRows: { id: string; name: string; phone: string }[] = [];
  for (let i = 0; i < 15; i++) {
    const name = `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`;
    let phone = `+549341${5550000 + i}`;
    while (phoneSet.has(phone)) phone = `+549341${randInt(4000000, 9999999)}`;
    phoneSet.add(phone);
    const email = Math.random() < 0.7
      ? `${slugify(name)}${randInt(0, 99)}@${rand(["gmail.com", "hotmail.com"])}`
      : null;
    const { data } = await supabase
      .from("customers").upsert(
        { business_id: biz, name, phone, email },
        { onConflict: "business_id,phone" },
      ).select("id, name, phone").single();
    if (data) customerRows.push(data);
  }
  console.log(`  ✓ ${customerRows.length} customers`);

  // Weighted products for 80/20
  const weightedProducts = resolvedProducts.map((p, i) => ({
    value: p, weight: i < 7 ? 8 : 3 + (i % 4),
  }));

  // ~60 orders históricas (30 días)
  console.log("Generando ~60 orders históricas...");
  let pastOk = 0;
  for (let i = 0; i < 60; i++) {
    const daysAgo = randInt(1, 30);
    const hour = randInt(12, 22);
    const createdAt = new Date();
    createdAt.setDate(createdAt.getDate() - daysAgo);
    createdAt.setHours(hour, randInt(0, 59), 0, 0);

    const deliveryType = pickWeighted([
      { value: "dine_in" as const, weight: 7 },
      { value: "delivery" as const, weight: 2 },
      { value: "pickup" as const, weight: 1 },
    ]);
    const status = pickWeighted([
      { value: "delivered" as const, weight: 8 },
      { value: "cancelled" as const, weight: 1 },
      { value: "ready" as const, weight: 1 },
    ]);

    const itemCount = randInt(2, 5);
    const items = Array.from({ length: itemCount }, () => {
      const p = pickWeighted(weightedProducts);
      const qty = randInt(1, 2);
      return { product_id: p.id, product_name: p.name, unit_price_cents: p.price_cents, quantity: qty, subtotal_cents: p.price_cents * qty, loaded_by: rand(mozoIds) };
    });
    const subtotal = items.reduce((s, it) => s + it.subtotal_cents, 0);
    const fee = deliveryType === "delivery" ? 80000 : 0;
    const customer = rand(customerRows);
    const method = pickWeighted([
      { value: "cash_on_delivery" as const, weight: 5 },
      { value: "card_on_delivery" as const, weight: 3 },
      { value: "mercado_pago" as const, weight: 2 },
    ]);

    const { data: order } = await supabase.from("orders").insert({
      order_number: 0, business_id: biz, customer_id: customer.id,
      customer_name: customer.name, customer_phone: customer.phone,
      delivery_type: deliveryType, status,
      lifecycle_status: status === "cancelled" ? "cancelled" : "closed",
      subtotal_cents: subtotal, delivery_fee_cents: fee,
      discount_cents: 0, total_cents: subtotal + fee,
      payment_method: method,
      payment_status: status === "delivered" ? "paid" : status === "cancelled" ? "refunded" : "pending",
      delivery_address: deliveryType === "delivery" ? `${rand(STREETS)} ${randInt(100, 4000)}` : null,
      created_at: createdAt.toISOString(), updated_at: createdAt.toISOString(),
      closed_at: status === "delivered" ? createdAt.toISOString() : null,
      cancelled_at: status === "cancelled" ? createdAt.toISOString() : null,
      cancelled_reason: status === "cancelled" ? "Cliente canceló" : null,
    }).select("id").single();
    if (!order) continue;
    await supabase.from("order_items").insert(items.map((it) => ({ ...it, order_id: order.id })));

    // Payment for delivered orders
    if (status === "delivered" && caja) {
      await supabase.from("payments").insert({
        order_id: order.id, business_id: biz, caja_id: caja.id,
        method, amount_cents: subtotal + fee, tip_cents: 0,
        payment_status: "completed", operated_by: encargadaId,
        attributed_mozo_id: rand(mozoIds), created_at: createdAt.toISOString(),
      });
    }
    pastOk++;
  }
  console.log(`  ✓ ${pastOk} orders históricas`);

  // ~8 orders de HOY (delivery/pickup para que aparezcan en el panel de pedidos)
  console.log("Generando orders de hoy...");
  let todayOk = 0;
  const todayStatuses: { status: string; lifecycle: string; payment: string }[] = [
    { status: "pending", lifecycle: "open", payment: "pending" },
    { status: "confirmed", lifecycle: "open", payment: "pending" },
    { status: "preparing", lifecycle: "open", payment: "paid" },
    { status: "preparing", lifecycle: "open", payment: "paid" },
    { status: "ready", lifecycle: "open", payment: "paid" },
    { status: "on_the_way", lifecycle: "open", payment: "paid" },
    { status: "delivered", lifecycle: "closed", payment: "paid" },
    { status: "delivered", lifecycle: "closed", payment: "paid" },
  ];
  for (let i = 0; i < todayStatuses.length; i++) {
    const hoursAgo = todayStatuses.length - i; // most recent = most advanced
    const createdAt = new Date();
    createdAt.setHours(createdAt.getHours() - hoursAgo, randInt(0, 30), 0, 0);
    if (createdAt > new Date()) continue; // don't create future timestamps

    const deliveryType = i % 2 === 0 ? "delivery" : "pickup";
    const st = todayStatuses[i]!;

    const itemCount = randInt(2, 4);
    const items = Array.from({ length: itemCount }, () => {
      const p = pickWeighted(weightedProducts);
      const qty = randInt(1, 2);
      return { product_id: p.id, product_name: p.name, unit_price_cents: p.price_cents, quantity: qty, subtotal_cents: p.price_cents * qty, loaded_by: rand(mozoIds) };
    });
    const subtotal = items.reduce((s, it) => s + it.subtotal_cents, 0);
    const fee = deliveryType === "delivery" ? 80000 : 0;
    const customer = rand(customerRows);
    const method = pickWeighted([
      { value: "cash_on_delivery" as const, weight: 4 },
      { value: "mercado_pago" as const, weight: 6 },
    ]);

    const { data: order } = await supabase.from("orders").insert({
      order_number: 0, business_id: biz, customer_id: customer.id,
      customer_name: customer.name, customer_phone: customer.phone,
      delivery_type: deliveryType, status: st.status,
      lifecycle_status: st.lifecycle,
      subtotal_cents: subtotal, delivery_fee_cents: fee,
      discount_cents: 0, total_cents: subtotal + fee,
      payment_method: method,
      payment_status: st.payment,
      delivery_address: deliveryType === "delivery" ? `${rand(STREETS)} ${randInt(100, 4000)}` : null,
      created_at: createdAt.toISOString(), updated_at: createdAt.toISOString(),
      closed_at: st.lifecycle === "closed" ? createdAt.toISOString() : null,
    }).select("id").single();
    if (!order) continue;
    await supabase.from("order_items").insert(items.map((it) => ({ ...it, order_id: order.id })));

    if (st.payment === "paid" && caja) {
      await supabase.from("payments").insert({
        order_id: order.id, business_id: biz, caja_id: caja.id,
        method, amount_cents: subtotal + fee, tip_cents: 0,
        payment_status: "completed", operated_by: encargadaId,
        attributed_mozo_id: rand(mozoIds), created_at: createdAt.toISOString(),
      });
    }
    todayOk++;
  }
  console.log(`  ✓ ${todayOk} orders de hoy`);

  // ~15 reservations históricas + 5 futuras
  console.log("Generando reservas...");
  let resOk = 0;
  for (let i = 0; i < 15; i++) {
    const daysAgo = randInt(1, 60);
    const slotHour = rand([12, 13, 20, 21]);
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() - daysAgo);
    startsAt.setHours(slotHour, rand([0, 30]), 0, 0);
    const partySize = randInt(2, 8);
    const table = allTables.find((t) => t.seats >= partySize) ?? rand(allTables);
    const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
    const rStatus = pickWeighted([
      { value: "completed" as const, weight: 75 },
      { value: "no_show" as const, weight: 10 },
      { value: "cancelled" as const, weight: 15 },
    ]);
    const { error } = await supabase.from("reservations").insert({
      business_id: biz, table_id: table.id,
      customer_name: rand(customerRows).name, customer_phone: rand(customerRows).phone,
      party_size: partySize, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
      status: rStatus, notes: rand(RESERVATION_NOTES), source: Math.random() < 0.7 ? "web" : "admin",
    });
    if (!error) resOk++;
  }
  for (let i = 0; i < 5; i++) {
    const daysAhead = randInt(1, 14);
    const slotHour = rand([12, 13, 20, 21]);
    const startsAt = new Date();
    startsAt.setDate(startsAt.getDate() + daysAhead);
    startsAt.setHours(slotHour, rand([0, 30]), 0, 0);
    const partySize = randInt(2, 6);
    const table = allTables.find((t) => t.seats >= partySize) ?? rand(allTables);
    const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
    const { error } = await supabase.from("reservations").insert({
      business_id: biz, table_id: table.id,
      customer_name: rand(customerRows).name, customer_phone: rand(customerRows).phone,
      party_size: partySize, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
      status: "confirmed", notes: rand(RESERVATION_NOTES), source: "web",
    });
    if (!error) resOk++;
  }

  // 4 reservas de HOY (aparecen en la vista por defecto del admin)
  const todaySlots = ["12:00", "13:00", "20:30", "21:30"];
  const todayResStatuses = ["confirmed", "confirmed", "confirmed", "seated"] as const;
  for (let i = 0; i < todaySlots.length; i++) {
    const [h, m] = todaySlots[i]!.split(":").map(Number);
    const startsAt = new Date();
    startsAt.setHours(h!, m!, 0, 0);
    const partySize = randInt(2, 6);
    const table = allTables.find((t) => t.seats >= partySize) ?? rand(allTables);
    const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
    const { error } = await supabase.from("reservations").insert({
      business_id: biz, table_id: table.id,
      customer_name: rand(customerRows).name, customer_phone: rand(customerRows).phone,
      party_size: partySize, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(),
      status: todayResStatuses[i], notes: rand(RESERVATION_NOTES), source: rand(["web", "admin"]),
    });
    if (!error) resOk++;
  }
  console.log(`  ✓ ${resOk} reservas (incluye ${todaySlots.length} de hoy)`);

  // ══════════════════════════════════════════════════════════════════════════
  // DONE
  // ══════════════════════════════════════════════════════════════════════════
  console.log(`\n━━━ Demo lista ━━━`);
  console.log(`URL:      /${DEMO_SLUG}`);
  console.log(`Login:    /${DEMO_SLUG}/admin/login`);
  console.log(`Password: ${TEAM_PASSWORD}`);
  console.log(`Demo hub: /${DEMO_SLUG}/demo`);
  console.log();
  for (const m of TEAM) console.log(`  · ${m.role.padEnd(10)} ${m.email}${m.pin ? ` (PIN ${m.pin})` : ""}`);
  console.log();
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
