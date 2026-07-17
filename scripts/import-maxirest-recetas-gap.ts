// @ts-nocheck
/**
 * import-maxirest-recetas-gap.ts
 * ────────────────────────────────────────────────────────────────────────
 * Gap-fill idempotente del escandallo de golf-jcr: completa lo que la
 * migración previa dejó afuera, SIN borrar ni re-migrar lo ya cargado.
 *
 * Estado de partida (verificado en cloud 2026-07-17, business_id
 * 0257f0ec-931f-498e-9ba0-5cf85b82d74c): 122 ingredients, 0 composites,
 * 0 ingredient_recipes, 447 recipes(product), 398 products.
 *
 * Qué llena, en orden (respeta las FK: insumos → composites → BOM → recetas):
 *   PASO 1. Crea los insumos-hijo faltantes (13, incluida Remolacha).
 *   PASO 2. Marca is_composite=true en los 13 compuestos ya existentes y
 *           crea el 14º compuesto faltante (Ñoquis de remolacha).
 *   PASO 3. Inserta las 68 líneas de BOM en ingredient_recipes (incluye 6
 *           líneas anidadas compuesto→compuesto).
 *   PASO 4. Completa recetas de PRODUCTO faltantes (solo los 32 FALTANTE con
 *           0 líneas). INCOMPLETE / sin-product / no-matcheados se REPORTAN
 *           para revisión manual, no se tocan.
 *
 * Idempotente: cada insert chequea existencia antes (o usa upsert
 * ignoreDuplicates). Correr N veces = mismo estado final.
 *
 * DECISIÓN ABIERTA (rendimiento/porciones) — ver NORMALIZE_BY_YIELD abajo.
 * DECISIÓN RESUELTA: "Queso muzzarella" (cod 157) NO se crea; se aliasa al
 * insumo existente "Muzarella" (916dd9b0-...). El único hijo simple realmente
 * ausente es "Remolacha".
 *
 * Uso:
 *   npx tsx scripts/import-maxirest-recetas-gap.ts            # dry-run (default)
 *   APPLY=1 npx tsx scripts/import-maxirest-recetas-gap.ts    # aplica
 *   APPLY=1 SKIP_PRODUCT_RECIPES=1 npx tsx ...                # solo compuestos
 *
 * PASO 4 lee el backup vivo de MaxiRest por `docker exec maxirest-restore`.
 * Si el contenedor no está arriba, PASO 4 se saltea con aviso (pasos 1-3 no
 * dependen de él).
 */

import { resolve } from "path";
import { execSync } from "child_process";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(__dirname, "../.env.local") });

const SLUG = "golf-jcr";
const APPLY = process.env.APPLY === "1";
const SKIP_PRODUCT_RECIPES = process.env.SKIP_PRODUCT_RECIPES === "1";

/**
 * DECISIÓN: cómo migrar la cantidad de la BOM de un compuesto.
 *
 * fn_ingredient_cost_per_unit / fn_explode_ingredient NO dividen por
 * rendimiento: el costo del compuesto = suma cruda de (hijo × cantidad ×
 * (1+merma)). O sea, cargar la cantidad cruda de MaxiRest hace que el costo
 * del compuesto sea el de UN BATCH ENTERO (rinde `porciones`), no el de una
 * porción. Si los productos referencian el compuesto en "porciones", el costo
 * queda inflado ×porciones.
 *
 * false (default): migra la cantidad CRUDA de mxrec (fiel a la fuente,
 *   reversible). El costeo por-porción queda pendiente de decidir junto con
 *   cómo referencian los productos al compuesto (frente aparte).
 * true: divide cada cantidad de la BOM por las porciones del compuesto padre
 *   → el compuesto pasa a costear "por porción". Requiere que los productos
 *   referencien el compuesto en porciones. NO valida el anidamiento (un hijo
 *   compuesto se mediría igual en porciones del hijo).
 *
 * Dejar en false hasta confirmar la semántica de unidad con el dominio.
 */
const NORMALIZE_BY_YIELD = process.env.NORMALIZE_BY_YIELD === "1";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// ── util ─────────────────────────────────────────────────────────────────
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca acentos
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const log = (...a: unknown[]) => console.log(...a);

// ═══════════════════════════════════════════════════════════════════════════
// DATOS EMBEBIDOS (reconciliación MaxiRest ↔ cloud, verificada por SQL)
// ═══════════════════════════════════════════════════════════════════════════

// PASO 1 — insumos-hijo faltantes (usados en recetas MaxiRest, sin ingredient
// en golf-jcr). cost_cents = round(precio_maxi*100), net_quantity=1.
// unidad válida: kg|lt|un|g|ml.
type MissingIng = {
  name: string;
  unit: "kg" | "lt" | "un" | "g" | "ml";
  cost_cents: number;
  net_quantity: number;
  note?: string;
};
const MISSING_INGREDIENTS: MissingIng[] = [
  { name: "Ají molido", unit: "kg", cost_cents: 1329828, net_quantity: 1 },
  { name: "Almejas enteras", unit: "kg", cost_cents: 990000, net_quantity: 1 },
  { name: "Choclo (Mc Cain)", unit: "kg", cost_cents: 678237, net_quantity: 1 },
  // OJO unidad 'CC' en MaxiRest: precio parece por envase, no por ml. Validar.
  { name: "Humo líquido", unit: "ml", cost_cents: 2662000, net_quantity: 1, note: "unidad CC dudosa" },
  { name: "Licor seco Tres Plumas", unit: "un", cost_cents: 428837, net_quantity: 1 },
  { name: "Mejillón pelado", unit: "kg", cost_cents: 2090000, net_quantity: 1 },
  { name: "Minerva limón", unit: "ml", cost_cents: 333012, net_quantity: 1, note: "unidad CC dudosa" },
  { name: "Naranja", unit: "kg", cost_cents: 102941, net_quantity: 1, note: "MaxiRest lo escribe 'NATANJA'" },
  { name: "Remolacha", unit: "kg", cost_cents: 520000, net_quantity: 1 }, // requerido por Ñoquis de remolacha
  { name: "Miel", unit: "kg", cost_cents: 0, net_quantity: 1, note: "precio 0 en MaxiRest, cargar costo real aparte" },
  { name: "Mortadela", unit: "kg", cost_cents: 0, net_quantity: 1, note: "precio 0" },
  { name: "Zapallito", unit: "kg", cost_cents: 0, net_quantity: 1, note: "precio 0" },
  { name: "Oporto", unit: "lt", cost_cents: 0, net_quantity: 1, note: "precio 0" },
];

// PASO 2 — los 13 compuestos que YA existen (flatten) → flip is_composite.
// Se resuelven por UUID (verificados en cloud), no por nombre.
const EXISTING_COMPOSITE_IDS: string[] = [
  "c67097ad-d96c-4095-ab97-53699853c8b2", // Crepe
  "06df199d-effd-4c27-a7d6-c869f93c5054", // Masa pastas frescas
  "84ff1a8e-f40c-4f18-8a9e-4bc82e6af288", // Masa pastas rellenas
  "2054ffd4-3eef-41be-aadd-bf20a7e0f554", // Ñoquis de papa
  "50a61bf0-a1c0-429f-9d48-84002079b72a", // Ravioles de verdura
  "26286444-b699-4562-b1f7-ff253def9630", // Salsa 4 quesos
  "8bde47c8-c3b0-4262-8055-697a57a4c776", // Salsa blanca
  "096d65d2-6b27-4efe-9ee1-e77f0676e116", // Salsa bolognesa
  "d3ec021c-728d-4219-86c2-a2fcc245b5cb", // Salsa crema
  "aba43022-f875-4471-8da7-fde932c7f5f1", // Salsa tuco
  "d86225df-4340-40e6-8615-142fc8c80366", // Sorrentinos de calabaza
  "d1ceaf39-3ced-46e2-89cd-16e1719ddcff", // Sorrentinos de salmón
  "94c196db-ba33-4048-a5db-7bb97e5c8f6e", // Sorrentinos JyQ
];

// El 14º compuesto no existe: se crea (unit un, is_composite=true).
const NEW_COMPOSITE = { name: "Ñoquis de remolacha", unit: "un" as const };

// Alias hijo MaxiRest → nombre normalizado del ingredient en cloud, para los
// que difieren ortográficamente (evita crear duplicados).
const CHILD_ALIAS: Record<string, string> = {
  maizena: "maicena",
  "pimento rojo": "pimiento rojo",
  "queso muzzarella": "muzarella", // existe como "Muzarella", NO crear duplicado
};

// PASO 3 — las 14 BOM (parent → hijos). `porciones` para la opción de
// normalización. Cada hijo: [nombre_hijo, cantidad_cruda]. Un hijo puede ser
// otro compuesto (anidamiento) — se resuelve por nombre igual que los simples.
type BomLine = [child: string, qty: number];
type Composite = { parent: string; porciones: number; bom: BomLine[] };
const COMPOSITES: Composite[] = [
  { parent: "Ñoquis de papa", porciones: 10, bom: [
    ["Huevos", 3], ["Harina 0000", 1.5], ["Sal fina", 0.04], ["Aceite de girasol", 0.02], ["Papa", 2.5],
  ] },
  { parent: "Masa pastas rellenas", porciones: 10, bom: [
    ["Huevos", 5], ["Harina 0000", 1], ["Sal fina", 0.04], ["Aceite de girasol", 0.02],
  ] },
  { parent: "Masa pastas frescas", porciones: 6, bom: [
    ["Huevos", 10], ["Harina 0000", 1], ["Sal fina", 0.04], ["Aceite de girasol", 0.02],
  ] },
  { parent: "Ñoquis de remolacha", porciones: 10, bom: [
    ["Huevos", 3], ["Harina 0000", 1.5], ["Sal fina", 0.04], ["Aceite de girasol", 0.02], ["Papa", 1.3], ["Remolacha", 1.2],
  ] },
  { parent: "Crepe", porciones: 25, bom: [
    ["Huevos", 5], ["Harina 0000", 0.5], ["Leche", 1], ["Sal fina", 0.02], ["Aceite de girasol", 0.02],
  ] },
  { parent: "Salsa crema", porciones: 200, bom: [
    ["Caldo de verduras", 0.04], ["Maicena", 0.15], ["Leche", 12], ["Sal fina", 0.04], ["Crema de leche", 10],
  ] },
  { parent: "Salsa tuco", porciones: 20, bom: [
    ["Tomate deshidratado", 1], ["Sal fina", 0.04], ["Aceite de girasol", 0.1], ["Zanahoria", 0.7],
    ["Cebolla", 1], ["Puerro", 0.5], ["Pimiento rojo", 0.7], ["Apio", 0.3],
  ] },
  { parent: "Salsa bolognesa", porciones: 20, bom: [
    ["Carne picada", 4], ["Tomate deshidratado", 1], ["Sal fina", 0.04], ["Aceite de girasol", 0.1],
    ["Zanahoria", 0.7], ["Cebolla", 1], ["Puerro", 0.5], ["Pimiento rojo", 0.7], ["Apio", 0.3],
  ] },
  { parent: "Salsa blanca", porciones: 10, bom: [
    ["Maicena", 0.1], ["Leche", 1], ["Sal fina", 0.04], ["Manteca", 0.02],
  ] },
  { parent: "Salsa 4 quesos", porciones: 1, bom: [
    ["Sal fina", 0.001], ["Queso azul", 0.05], ["Queso sardo", 0.05], ["Salsa crema", 1], // anidado
  ] },
  { parent: "Ravioles de verdura", porciones: 9, bom: [
    ["Cebolla", 0.25], ["Acelga", 2], ["Pimiento rojo", 0.35],
    ["Masa pastas rellenas", 1], ["Salsa blanca", 1], // anidados
  ] },
  { parent: "Sorrentinos JyQ", porciones: 5, bom: [
    ["Jamón cocido", 0.4], ["Queso muzzarella", 0.6], ["Masa pastas rellenas", 1], // anidado
  ] },
  { parent: "Sorrentinos de calabaza", porciones: 5, bom: [
    ["Calabaza", 0.6], ["Queso muzzarella", 0.6], ["Masa pastas rellenas", 1], // anidado
  ] },
  { parent: "Sorrentinos de salmón", porciones: 5, bom: [
    ["Filet de salmón", 0.8], ["Puerro", 0.3], ["Masa pastas rellenas", 5], // anidado
  ] },
];

// PASO 4 — override explícito cod_art MaxiRest → product_id cloud, para los
// dishes que NO matchean por nombre normalizado (fuzzy/typos). Vacío por
// defecto: completar tras revisar el reporte de no-matcheados. NUNCA adivinar.
const PRODUCT_OVERRIDE: Record<number, string> = {
  // [cod_art]: "product_id_uuid",
};

// ═══════════════════════════════════════════════════════════════════════════
// EJECUCIÓN
// ═══════════════════════════════════════════════════════════════════════════

async function resolveBusinessId(): Promise<string> {
  const { data, error } = await sb.from("businesses").select("id").eq("slug", SLUG).maybeSingle();
  if (error || !data) throw new Error(`No se encontró el negocio '${SLUG}': ${error?.message}`);
  return data.id as string;
}

/** Mapa normalizado nombre→{id,is_composite} de todos los ingredients del negocio. */
async function loadIngredientMap(businessId: string) {
  const { data, error } = await sb
    .from("ingredients")
    .select("id, name, is_composite")
    .eq("business_id", businessId);
  if (error) throw error;
  const map = new Map<string, { id: string; is_composite: boolean; name: string }>();
  for (const i of data ?? []) map.set(norm(i.name), { id: i.id, is_composite: i.is_composite, name: i.name });
  return map;
}

/** Resuelve un nombre de hijo a ingredient_id, aplicando alias. */
function resolveChild(name: string, map: Map<string, { id: string }>): string | null {
  const key = norm(name);
  const aliased = CHILD_ALIAS[key] ?? key;
  return map.get(aliased)?.id ?? null;
}

async function step1_missingIngredients(businessId: string, map: Map<string, any>) {
  log("\n── PASO 1: insumos-hijo faltantes ──────────────────────────");
  let created = 0;
  for (const ing of MISSING_INGREDIENTS) {
    const key = norm(ing.name);
    if (map.has(key)) {
      log(`  = ya existe: ${ing.name}`);
      continue;
    }
    log(`  + crear insumo: ${ing.name} (${ing.unit}, ${ing.cost_cents}c/${ing.net_quantity})${ing.note ? "  ⚠ " + ing.note : ""}`);
    if (!APPLY) continue;
    const { data: created_ing, error } = await sb
      .from("ingredients")
      .insert({ business_id: businessId, name: ing.name, unit: ing.unit, waste_percent: 0, is_active: true, is_composite: false })
      .select("id")
      .single();
    if (error || !created_ing) { log(`    ✗ error insertando ingredient: ${error?.message}`); continue; }
    const { error: presErr } = await sb.from("ingredient_presentations").insert({
      ingredient_id: created_ing.id, name: "Default", net_quantity: ing.net_quantity, cost_cents: ing.cost_cents, is_default: true,
    });
    if (presErr) { log(`    ✗ error insertando presentación: ${presErr.message}`); continue; }
    map.set(key, { id: created_ing.id, is_composite: false, name: ing.name });
    created++;
  }
  log(`  → creados: ${created}`);
}

async function step2_composites(businessId: string, map: Map<string, any>) {
  log("\n── PASO 2: is_composite=true + compuesto faltante ──────────");
  // flip los 13 existentes por UUID
  let flipped = 0;
  for (const id of EXISTING_COMPOSITE_IDS) {
    if (!APPLY) { log(`  ~ flip is_composite=true: ${id}`); flipped++; continue; }
    const { error } = await sb.from("ingredients").update({ is_composite: true }).eq("id", id).eq("business_id", businessId);
    if (error) { log(`    ✗ error flip ${id}: ${error.message}`); continue; }
    flipped++;
  }
  log(`  → marcados compuestos: ${flipped}/13`);

  // crear Ñoquis de remolacha si falta
  const key = norm(NEW_COMPOSITE.name);
  const existing = map.get(key);
  if (existing) {
    log(`  = ya existe: ${NEW_COMPOSITE.name} (asegurando is_composite=true)`);
    if (APPLY) await sb.from("ingredients").update({ is_composite: true }).eq("id", existing.id);
    map.set(key, { ...existing, is_composite: true });
  } else {
    log(`  + crear compuesto: ${NEW_COMPOSITE.name}`);
    if (APPLY) {
      const { data: nc, error } = await sb
        .from("ingredients")
        .insert({ business_id: businessId, name: NEW_COMPOSITE.name, unit: NEW_COMPOSITE.unit, waste_percent: 0, is_active: true, is_composite: true })
        .select("id")
        .single();
      if (error || !nc) log(`    ✗ error: ${error?.message}`);
      else map.set(key, { id: nc.id, is_composite: true, name: NEW_COMPOSITE.name });
    }
  }
}

async function step3_bom(map: Map<string, any>) {
  log("\n── PASO 3: ingredient_recipes (BOM, 68 líneas) ─────────────");
  log(`  NORMALIZE_BY_YIELD = ${NORMALIZE_BY_YIELD} (cantidad ${NORMALIZE_BY_YIELD ? "÷ porciones" : "CRUDA"})`);
  const rows: { parent_ingredient_id: string; child_ingredient_id: string; quantity: number; notes: string | null }[] = [];
  const unresolved: string[] = [];

  for (const comp of COMPOSITES) {
    const parent = map.get(norm(comp.parent));
    if (!parent) { unresolved.push(`PADRE no encontrado: ${comp.parent}`); continue; }
    for (const [childName, rawQty] of comp.bom) {
      const childId = resolveChild(childName, map);
      if (!childId) { unresolved.push(`  hijo no encontrado: ${childName} (padre ${comp.parent})`); continue; }
      if (childId === parent.id) { unresolved.push(`  self-ref: ${comp.parent}`); continue; }
      const qty = NORMALIZE_BY_YIELD ? rawQty / comp.porciones : rawQty;
      rows.push({ parent_ingredient_id: parent.id, child_ingredient_id: childId, quantity: qty, notes: null });
    }
  }

  if (unresolved.length) { log("  ⚠ sin resolver:"); unresolved.forEach((u) => log("   " + u)); }
  log(`  líneas a insertar: ${rows.length} (esperado 68)`);
  if (!APPLY) return;

  // Idempotente: upsert por (parent,child), ignora duplicados.
  const { error } = await sb
    .from("ingredient_recipes")
    .upsert(rows, { onConflict: "parent_ingredient_id,child_ingredient_id", ignoreDuplicates: true });
  if (error) log(`    ✗ error insertando BOM: ${error.message}`);
  else log(`  → BOM cargada (ignoreDuplicates on).`);
}

// PASO 4 — recetas de producto FALTANTE (0 líneas). Lee MaxiRest en vivo.
function maxirest(sql: string): string {
  return execSync(
    `docker exec maxirest-restore mariadb -uroot -N -e ${JSON.stringify(`USE mx_maxirest; ${sql}`)}`,
    { encoding: "utf8" },
  );
}

async function step4_productRecipes(businessId: string, ingMap: Map<string, any>) {
  log("\n── PASO 4: recetas de producto FALTANTE (0 líneas) ─────────");
  if (SKIP_PRODUCT_RECIPES) { log("  (saltado por SKIP_PRODUCT_RECIPES=1)"); return; }

  // ¿está el contenedor?
  let rawArt: string, rawLines: string;
  try {
    // cabezas de receta con nombre (cod_art>0)
    rawArt = maxirest(
      "SELECT DISTINCT r.cod_art, a.nombre FROM mxrec r JOIN mxart a ON a.codigo=r.cod_art WHERE r.cod_art>0 AND a.nombre<>'';",
    );
    // todas las líneas de receta de producto (cod_art>0)
    rawLines = maxirest(
      "SELECT r.cod_art, i.nombre, r.cantidad FROM mxrec r JOIN mxins i ON i.codigo=r.cod_ins WHERE r.cod_art>0;",
    );
  } catch (e) {
    log(`  ⚠ no se pudo leer MaxiRest (¿contenedor 'maxirest-restore' arriba?). Salteo PASO 4.`);
    log(`    ${(e as Error).message.split("\n")[0]}`);
    return;
  }

  // parse
  const artName = new Map<number, string>();
  for (const ln of rawArt.trim().split("\n").filter(Boolean)) {
    const [cod, ...rest] = ln.split("\t");
    artName.set(Number(cod), rest.join("\t"));
  }
  const linesByArt = new Map<number, { ins: string; qty: number }[]>();
  for (const ln of rawLines.trim().split("\n").filter(Boolean)) {
    const [cod, ins, qty] = ln.split("\t");
    const c = Number(cod);
    if (!linesByArt.has(c)) linesByArt.set(c, []);
    linesByArt.get(c)!.push({ ins, qty: Number(qty) });
  }

  // mapa producto normalizado → id
  const { data: products, error: pErr } = await sb
    .from("products")
    .select("id, name")
    .eq("business_id", businessId);
  if (pErr) throw pErr;
  const prodMap = new Map<string, string>();
  for (const p of products ?? []) prodMap.set(norm(p.name), p.id);

  // ids con recetas ya cargadas (>0 líneas) — para no duplicar
  const { data: existingLines } = await sb
    .from("recipes")
    .select("product_id, products!inner(business_id)")
    .eq("products.business_id", businessId);
  const productsWithRecipe = new Set<string>((existingLines ?? []).map((r: any) => r.product_id));

  const report = { faltanteInsertado: 0, incompleta: [] as string[], sinProduct: [] as string[], insumoNoMatch: [] as string[] };

  for (const [cod, name] of artName) {
    const productId = PRODUCT_OVERRIDE[cod] ?? prodMap.get(norm(name));
    if (!productId) { report.sinProduct.push(`${cod} · ${name}`); continue; }

    if (productsWithRecipe.has(productId)) {
      // OK o INCOMPLETA → no tocar, reportar para revisión manual
      report.incompleta.push(`${cod} · ${name} (product ${productId})`);
      continue;
    }

    // FALTANTE (0 líneas en cloud) → insertar receta completa
    const srcLines = linesByArt.get(cod) ?? [];
    const rows: { product_id: string; ingredient_id: string; quantity: number; notes: null }[] = [];
    const seen = new Set<string>();
    for (const { ins, qty } of srcLines) {
      const ingId = resolveChild(ins, ingMap);
      if (!ingId) { report.insumoNoMatch.push(`${name}: insumo '${ins}'`); continue; }
      if (seen.has(ingId)) continue; // recipes: 1 ingrediente por receta
      seen.add(ingId);
      rows.push({ product_id: productId, ingredient_id: ingId, quantity: qty, notes: null });
    }
    if (rows.length === 0) continue;
    log(`  + receta FALTANTE: ${name} → ${rows.length} líneas`);
    if (APPLY) {
      const { error } = await sb
        .from("recipes")
        .upsert(rows, { onConflict: "product_id,ingredient_id", ignoreDuplicates: true });
      if (error) { log(`    ✗ ${error.message}`); continue; }
    }
    report.faltanteInsertado++;
  }

  log(`\n  RESUMEN PASO 4:`);
  log(`   recetas FALTANTE insertadas: ${report.faltanteInsertado}`);
  log(`   dishes SIN product en cloud (revisar/crear product o override): ${report.sinProduct.length}`);
  report.sinProduct.forEach((s) => log(`     - ${s}`));
  log(`   productos con receta previa (INCOMPLETA/OK, NO tocados — revisión manual): ${report.incompleta.length}`);
  report.incompleta.forEach((s) => log(`     ~ ${s}`));
  if (report.insumoNoMatch.length) {
    log(`   líneas con insumo no matcheado (omitidas): ${report.insumoNoMatch.length}`);
    report.insumoNoMatch.forEach((s) => log(`     ! ${s}`));
  }
}

async function main() {
  log(`=== gap-fill recetas MaxiRest → ${SLUG} ===`);
  log(APPLY ? "MODO: APPLY (escribe en cloud)" : "MODO: DRY-RUN (no escribe; correr con APPLY=1 para aplicar)");
  const businessId = await resolveBusinessId();
  log(`business_id: ${businessId}`);

  const ingMap = await loadIngredientMap(businessId);
  log(`ingredients actuales: ${ingMap.size}`);

  await step1_missingIngredients(businessId, ingMap);
  await step2_composites(businessId, ingMap);
  // recargar mapa por si se crearon insumos/compuestos en APPLY
  const freshMap = APPLY ? await loadIngredientMap(businessId) : ingMap;
  await step3_bom(freshMap);
  await step4_productRecipes(businessId, freshMap);

  log("\n=== fin ===");
  if (!APPLY) log("Nada fue escrito. Revisá el plan y volvé a correr con APPLY=1.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
