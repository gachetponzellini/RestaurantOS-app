/**
 * Import real ingredient/recipe/cost data from Maxirest into RestaurantOS.
 *
 * Pre-requisite: run `npx tsx scripts/parse-maxirest.ts` first to generate
 * the JSON files at C:/tmp/mx_*.json from the Maxirest SQL dump.
 *
 * This script:
 *   1. Reads the pre-parsed JSON files (mx_insumos, mx_articles, mx_recipes)
 *   2. Clears existing ingredients/recipes/sub-recipes for the target business
 *   3. Creates real ingredients with presentations and prices
 *   4. Creates recipe lines linking products to ingredients
 *   5. Creates sub-recipes for composite ingredients (mxrec with negative cod_art)
 *
 * Usage:
 *   npx tsx scripts/seed-maxirest-ingredients.ts [slug]
 *   npx tsx scripts/seed-maxirest-ingredients.ts golf-jcr
 *
 * Requires .env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

config({ path: ".env.local" });

const BUSINESS_SLUG = process.argv[2] ?? "golf-jcr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ════════════════════════════════════════════════════════════════════════════
// DATA TYPES (match the JSON output from parse-maxirest.ts)
// ════════════════════════════════════════════════════════════════════════════

type MxInsumo = {
  codigo: number;
  nombre: string;
  unidad_med: string;
  precio: number;
  stock_min: number;
  stock_max: number;
  desperdicio: number;
  envase1: string;
  neto1: number;
  precio1: number;
  envase2: string;
  neto2: number;
  precio2: number;
  envase3: string;
  neto3: number;
  precio3: number;
};

type MxArticulo = {
  codigo: number;
  nombre: string;
};

type MxReceta = {
  cod_art: number;
  cod_ins: number;
  cantidad: number;
  observac: string;
};

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

type RosUnit = "kg" | "lt" | "un" | "g" | "ml";

function mapUnit(mxUnit: string): RosUnit {
  const u = mxUnit.toUpperCase().trim();
  if (u === "KG") return "kg";
  if (u === "LT" || u === "LTS" || u === "L") return "lt";
  if (u === "GR" || u === "G") return "g";
  if (u === "ML") return "ml";
  return "un";
}

/** Title-case a Maxirest ALL-CAPS name, preserving abbreviations */
function titleCase(s: string): string {
  // Fix encoding issues for common chars (Maxirest dump is latin1)
  let fixed = s
    .replace(/\x00/g, "")
    .replace(/\?/g, "ñ"); // Common replacement for ñ in latin1→UTF-8

  return fixed
    .split(" ")
    .map((w) => {
      if (!w) return w;
      // Keep acronyms (all caps, 2-4 chars like CC, KG, ML)
      if (w.length <= 4 && w === w.toUpperCase() && /^[A-Z0-9]+$/.test(w)) return w;
      // Title case
      return w[0].toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/** Normalize for matching: lowercase, remove accents, collapse spaces */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokenize a name: lowercase, remove accents, split into meaningful words */
function tokenize(s: string): string[] {
  const stopWords = new Set(["de", "del", "a", "la", "las", "los", "el", "en", "con", "y", "o", "al", "c", "cc"]);
  return norm(s)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));
}

/** Score how well mxName matches rosName (0-1) */
function matchScore(mxName: string, rosName: string): number {
  const mxTokens = tokenize(mxName);
  const rosTokens = tokenize(rosName);
  if (mxTokens.length === 0 || rosTokens.length === 0) return 0;

  // Count how many mx tokens appear in ros tokens
  let hits = 0;
  for (const mt of mxTokens) {
    if (rosTokens.some((rt) => rt.includes(mt) || mt.includes(rt))) hits++;
  }
  return hits / mxTokens.length;
}

/**
 * Manual overrides for known name mismatches.
 * Key: normalized Maxirest article name, Value: normalized ROS product name
 */
const MANUAL_MAP: Record<string, string> = {
  // Spelling differences
  "calamaretes leonesa": "calamarettes a la leonesa",
  "calamaretes parmesano": "calamarettes rebozados con rucula y parmesano",
  "calamaretes grillados": "calamarettes rebozados con rucula y parmesano",
  // Descriptive expansions
  "costillas barbacoa": "costillas de cerdo a la barbacoa",
  "lomo reduccion": "lomo en reduccion de conac y crocante de panceta",
  "lomo relleno": "lomo relleno con queso provolone",
  "salmon crema camarones": "salmon rosado con crema de camarones",
  "salmon crema limon": "salmon en salsa de limon con salteado de espinacas y champignones",
  "salmon especial": "salmon en salsa de limon con salteado de espinacas y champignones",
  "pollo especial": "fillet de pollo con puerros, panceta y champignones",
  "pollo sugerencia": "fillet de pollo con puerros, panceta y champignones",
  "matambrito pizza": "matambrito a la pizza",
  "matambrito roquefort nueces": "matambrito de cerdo al roquefort con nueces",
  "espinaca graten": "espinacas al graten",
  "langostinos": "langostinos rebozados en panko con papas rejillas",
  "omelette caprece": "omelette de caprese",
  "omelette": "omelette de jamon y queso",
  "omelette espinacas queso azul y": "omelette de caprese",
  "tortilla papas": "tortilla de papa y cebolla",
  "tortilla espinaca": "tortilla de espinaca y langostinos",
  "merluza romana": "merluza a la romana",
  "rabas": "rabas con salsa tartara",
  "ensalada 1 gusto": "ensalada comun",
  "ensalada 2 gustos": "ensalada comun",
  "ensalada completa": "ensalada completa",
  "ensalada con parmesano": "rucula y parmesano",
  "ensalada con parmesano y aceitunas negras": "rucula, parmesano y aceitunas negras",
  "ensalada caprese": "capresse",
  "ensalada pollo rebozado": "pollo rebozado",
  "revuelto gramajo": "revuelto gramajo",
  "vithel tonne": "vithel tonne",
  "arrollado casero": "arrollado casero",
  "papa rejilla": "papas rejilla",
  "papa espanola": "papas fritas",
  "milanesa entrecot": "milanesa de entrecot",
  "milanesa entrecot napolitana": "milanesa de entrecot napolitana",
  "milanesa napolitana": "milanesa napolitana",
  "suprema napolitana": "suprema napolitana",
  "familiar milanesa": "milanesa",
  "familiar milanesa j y q": "milanesa napolitana",
  "tostado mixto": "milanesa",
  "pacu grillado": "pacu grillado",
  "noquis": "noquis de papa",
  "sorrentinos jamon y queso": "sorrentinos de muzzarella y jamon",
  "sorrentinos calabaza": "sorrentinos de calabaza asada y muzzarella",
  "sorrentinos salmon c/tinta": "sorrentinos negros de salmon",
  "solomillo especial": "entrecot en salsa ahumada de hongos de pino",
  "molleja": "mollejas",
  "mollejas al jerez verdeo": "mollejas al jerez con verdeo y dados de papas",
  "salteado molleja verdeo": "mollejas al jerez con verdeo y dados de papas",
  "osobuco braseado": "entrecot",
  "helado especial": "helado simple",
  "helado especial doble": "helado doble",
  "helado sambayon": "helado sambayon",
  "flan": "flan casero",
  "ensalada de frutas": "ensalada de frutas",
  "macedonia": "macedonia",
  "bombon escoces": "helado simple",
  "bombon suizo": "helado simple",
  "papas fritas": "papas fritas",
  "papas c/crema": "papas a la crema",
  "papas provenzal": "papas a la provenzal",
  "papas gratinadas": "papas gratinadas",
  "pure": "pure",
  "pure de manzana": "pure de manzana",
  "provoleta especial": "provoleta especial",
  "crepes de verdura": "crepes de verdura",
  "lasagna": "graten con salsa blanca",
  "filet de pollo": "filet de pollo",
  "creppe de verdura": "crepes de verdura",
  "sorrentinos jyq": "sorrentinos de muzzarella y jamon",
  "sabayon batido": "sambayon batido con nueces",
  "empanada jam y queso": "empanadas",
  "empanada carne": "empanadas",
  "ensalada queso azul": "rucula, parmesano y aceitunas negras",
  "jamon crudo": "queso, higos en almibar, dulce de cayote y nueces",
  "carbonara": "pesto",
  "caruso": "bolognesa",
  "mariscada": "langostinos rebozados en panko con papas rejillas",
};

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n━━━ Maxirest → RestaurantOS ingredient import ━━━`);
  console.log(`Business: ${BUSINESS_SLUG}\n`);

  // ── 1. Get business ID ─────────────────────────────────────────────────
  const { data: biz } = await supabase
    .from("businesses")
    .select("id")
    .eq("slug", BUSINESS_SLUG)
    .maybeSingle();
  if (!biz) {
    console.error(`Business "${BUSINESS_SLUG}" not found.`);
    process.exit(1);
  }
  const businessId = biz.id;
  console.log(`  Business ID: ${businessId}`);

  // ── 2. Read parsed JSON files ──────────────────────────────────────────
  console.log(`\n  Reading JSON data...`);

  const mxInsumos: MxInsumo[] = JSON.parse(
    fs.readFileSync("C:/tmp/mx_insumos.json", "utf-8"),
  );
  const mxArticulos: MxArticulo[] = JSON.parse(
    fs.readFileSync("C:/tmp/mx_articles.json", "utf-8"),
  );
  const mxRecipes: MxReceta[] = JSON.parse(
    fs.readFileSync("C:/tmp/mx_recipes.json", "utf-8"),
  );

  // Filter: only valid insumos (have a name)
  const validInsumos = mxInsumos.filter((i) => i.nombre.trim() !== "");
  // Filter: only real recipe lines (positive cod_art = product recipe, not sub-recipe)
  const realRecipeLines = mxRecipes.filter(
    (r) => r.cod_art > 0 && r.cod_ins > 0 && r.cantidad > 0,
  );
  // Sub-recipes: negative cod_art means parent ingredient = abs(cod_art)
  const subRecipeLines = mxRecipes.filter(
    (r) => r.cod_art < 0 && r.cod_ins > 0 && r.cantidad > 0,
  );

  console.log(`    Insumos: ${validInsumos.length} (de ${mxInsumos.length} total)`);
  console.log(`    Artículos: ${mxArticulos.length}`);
  console.log(`    Recetas reales: ${realRecipeLines.length} (de ${mxRecipes.length} total)`);
  console.log(`    Sub-recetas: ${subRecipeLines.length}`);

  // Build lookup maps
  const artByCode = new Map<number, MxArticulo>();
  for (const a of mxArticulos) artByCode.set(a.codigo, a);

  // ── 3. Get existing products from RestaurantOS ─────────────────────────
  const { data: products } = await supabase
    .from("products")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("is_active", true);

  const productByNorm = new Map<string, { id: string; name: string }>();
  for (const p of products ?? []) {
    productByNorm.set(norm(p.name), p);
  }
  console.log(`  RestaurantOS products: ${productByNorm.size}`);

  // ── 4. Clear existing ingredients, presentations, recipes ──────────────
  console.log(`\n  Clearing old ingredient data...`);

  const { data: existingIngs } = await supabase
    .from("ingredients")
    .select("id")
    .eq("business_id", businessId);

  if (existingIngs && existingIngs.length > 0) {
    const ingIds = existingIngs.map((i: any) => i.id as string);

    // Delete in chunks (avoid PostgREST URL length limits)
    for (let i = 0; i < ingIds.length; i += 40) {
      const batch = ingIds.slice(i, i + 40);
      await supabase.from("recipes").delete().in("ingredient_id", batch);
      await supabase.from("ingredient_recipes").delete().in("parent_ingredient_id", batch);
      await supabase.from("ingredient_recipes").delete().in("child_ingredient_id", batch);
      await supabase.from("ingredient_presentations").delete().in("ingredient_id", batch);
    }
    // Clear consumption log for this business
    await supabase.from("ingredient_consumptions").delete().eq("business_id", businessId);

    for (let i = 0; i < ingIds.length; i += 40) {
      const batch = ingIds.slice(i, i + 40);
      await supabase.from("ingredients").delete().in("id", batch);
    }
    console.log(`    Borrados: ${existingIngs.length} ingredientes antiguos`);
  }

  // Also clear any orphan recipes (recipes pointing to now-deleted ingredients)
  // by deleting all recipes for products in this business
  if (products && products.length > 0) {
    for (let i = 0; i < products.length; i += 40) {
      const batch = products.slice(i, i + 40).map((p) => p.id);
      await supabase.from("recipes").delete().in("product_id", batch);
    }
  }

  // ── 5. Insert ingredients with presentations ───────────────────────────
  console.log(`\n  Creando ingredientes...`);

  const ingIdByCode = new Map<number, string>(); // mxins.codigo → ROS ingredient UUID
  let ingCreated = 0;
  let presCreated = 0;
  let ingSkipped = 0;

  for (const ins of validInsumos) {
    if (ins.codigo <= 0) { ingSkipped++; continue; }

    const unit = mapUnit(ins.unidad_med);
    const name = titleCase(ins.nombre);

    const { data: inserted, error } = await supabase
      .from("ingredients")
      .insert({
        business_id: businessId,
        name,
        unit,
        waste_percent: ins.desperdicio,
        stock_quantity: 0,
        stock_min_alert: ins.stock_min > 0 ? ins.stock_min : null,
        is_active: true,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      if (error?.code === "23505") {
        // Duplicate name — skip silently (Maxirest has some dupes)
        ingSkipped++;
      } else {
        console.warn(`    ✗ "${name}" (code ${ins.codigo}): ${error?.message}`);
      }
      continue;
    }

    ingIdByCode.set(ins.codigo, inserted.id);
    ingCreated++;

    // Build presentations
    const pres: {
      ingredient_id: string;
      name: string;
      net_quantity: number;
      cost_cents: number;
      is_default: boolean;
    }[] = [];

    const hasPres1 = ins.envase1 !== "" && ins.neto1 > 0;
    const hasPres2 = ins.envase2 !== "" && ins.neto2 > 0;
    const hasPres3 = ins.envase3 !== "" && ins.neto3 > 0;
    const hasNamedPres = hasPres1 || hasPres2 || hasPres3;

    if (hasNamedPres) {
      let defaultSet = false;
      if (hasPres1) {
        pres.push({
          ingredient_id: inserted.id,
          name: titleCase(ins.envase1),
          net_quantity: ins.neto1,
          cost_cents: Math.round(ins.precio1 * 100),
          is_default: true,
        });
        defaultSet = true;
      }
      if (hasPres2) {
        pres.push({
          ingredient_id: inserted.id,
          name: titleCase(ins.envase2),
          net_quantity: ins.neto2,
          cost_cents: Math.round(ins.precio2 * 100),
          is_default: !defaultSet,
        });
        if (!defaultSet) defaultSet = true;
      }
      if (hasPres3) {
        pres.push({
          ingredient_id: inserted.id,
          name: titleCase(ins.envase3),
          net_quantity: ins.neto3,
          cost_cents: Math.round(ins.precio3 * 100),
          is_default: !defaultSet,
        });
        if (!defaultSet) defaultSet = true;
      }

      // Also add base unit if has a price
      if (ins.precio > 0) {
        const label = unit === "kg" ? "1 KG" : unit === "lt" ? "1 LT" : "Unidad";
        pres.push({
          ingredient_id: inserted.id,
          name: label,
          net_quantity: 1,
          cost_cents: Math.round(ins.precio * 100),
          is_default: false,
        });
      }
    } else {
      // No named presentations — create one from base price
      const price = ins.precio > 0 ? ins.precio : 0;
      const label = unit === "kg" ? "1 KG" : unit === "lt" ? "1 LT" : "Unidad";
      pres.push({
        ingredient_id: inserted.id,
        name: label,
        net_quantity: 1,
        cost_cents: Math.round(price * 100),
        is_default: true,
      });
    }

    if (pres.length > 0) {
      const { error: presErr } = await supabase
        .from("ingredient_presentations")
        .insert(pres);
      if (presErr) {
        console.warn(`    ✗ Presentaciones "${name}": ${presErr.message}`);
      } else {
        presCreated += pres.length;
      }
    }
  }
  console.log(`  ✓ ${ingCreated} ingredientes creados (${ingSkipped} omitidos)`);
  console.log(`  ✓ ${presCreated} presentaciones creadas`);

  // ── 6. Insert recipes ──────────────────────────────────────────────────
  console.log(`\n  Creando recetas...`);

  // Group recipe lines by cod_art
  const recipesByArt = new Map<number, MxReceta[]>();
  for (const r of realRecipeLines) {
    if (!recipesByArt.has(r.cod_art)) recipesByArt.set(r.cod_art, []);
    recipesByArt.get(r.cod_art)!.push(r);
  }

  let recipesCreated = 0;
  let recipesSkipped = 0;
  const unmatchedProducts: string[] = [];
  const processedProductIds = new Set<string>(); // avoid duplicate product recipes

  for (const [codArt, lines] of recipesByArt) {
    const art = artByCode.get(codArt);
    if (!art || !art.nombre.trim()) { recipesSkipped++; continue; }

    // Find matching ROS product using multi-strategy matching
    const normArt = norm(art.nombre);
    let rosProduct = productByNorm.get(normArt);

    // Strategy 2: manual override map
    if (!rosProduct) {
      const override = MANUAL_MAP[normArt];
      if (override) rosProduct = productByNorm.get(norm(override));
    }

    // Strategy 3: contains match
    if (!rosProduct) {
      for (const [normName, prod] of productByNorm) {
        if (normName.includes(normArt) || normArt.includes(normName)) {
          rosProduct = prod;
          break;
        }
      }
    }

    // Strategy 4: token-based fuzzy match (>= 0.7 overlap)
    if (!rosProduct) {
      let bestScore = 0;
      let bestProd: typeof rosProduct = undefined;
      for (const [, prod] of productByNorm) {
        const score = matchScore(art.nombre, prod.name);
        if (score > bestScore && score >= 0.7) {
          bestScore = score;
          bestProd = prod;
        }
      }
      if (bestProd) rosProduct = bestProd;
    }

    if (!rosProduct) {
      unmatchedProducts.push(`${art.nombre} (code ${codArt}, ${lines.length} líneas)`);
      recipesSkipped++;
      continue;
    }

    // Skip if we already created a recipe for this ROS product (multiple mx articles → same product)
    if (processedProductIds.has(rosProduct.id)) continue;

    // Build recipe rows, dedup by ingredient
    const seen = new Set<string>();
    const rows: any[] = [];

    for (const l of lines) {
      const ingId = ingIdByCode.get(l.cod_ins);
      if (!ingId || seen.has(ingId)) continue;
      seen.add(ingId);
      rows.push({
        product_id: rosProduct.id,
        ingredient_id: ingId,
        quantity: l.cantidad,
        notes: l.observac?.trim() || null,
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("recipes").insert(rows);
      if (error) {
        console.warn(`    ✗ Receta "${rosProduct.name}": ${error.message}`);
      } else {
        recipesCreated++;
        processedProductIds.add(rosProduct.id);
      }
    }
  }

  console.log(`  ✓ ${recipesCreated} recetas creadas`);
  if (recipesSkipped > 0) {
    console.log(`  ⚠ ${recipesSkipped} recetas omitidas (producto no matcheado)`);
  }

  if (unmatchedProducts.length > 0) {
    console.log(`\n  Productos Maxirest sin match en ROS (tienen receta pero no se importó):`);
    for (const p of unmatchedProducts.slice(0, 40)) {
      console.log(`    - ${p}`);
    }
    if (unmatchedProducts.length > 40) {
      console.log(`    ... y ${unmatchedProducts.length - 40} más`);
    }
  }

  // ── 7. Import sub-recipes (composite ingredients) ─────────────────────
  console.log(`\n  Importando sub-recetas...`);

  // Group sub-recipe lines by parent ingredient code (abs(cod_art))
  const subRecipesByParent = new Map<number, MxReceta[]>();
  for (const r of subRecipeLines) {
    const parentCode = Math.abs(r.cod_art);
    if (!subRecipesByParent.has(parentCode)) subRecipesByParent.set(parentCode, []);
    subRecipesByParent.get(parentCode)!.push(r);
  }

  let compositeCount = 0;
  let subRecipeLinesCreated = 0;
  let subRecipeSkipped = 0;

  for (const [parentCode, lines] of subRecipesByParent) {
    const parentIngId = ingIdByCode.get(parentCode);
    if (!parentIngId) {
      subRecipeSkipped++;
      continue;
    }

    // Mark ingredient as composite
    await supabase
      .from("ingredients")
      .update({ is_composite: true })
      .eq("id", parentIngId);

    // Build sub-recipe rows, dedup by child ingredient
    const seen = new Set<string>();
    const rows: any[] = [];

    for (const l of lines) {
      const childIngId = ingIdByCode.get(l.cod_ins);
      if (!childIngId || childIngId === parentIngId || seen.has(childIngId)) continue;
      seen.add(childIngId);
      rows.push({
        parent_ingredient_id: parentIngId,
        child_ingredient_id: childIngId,
        quantity: l.cantidad,
        notes: l.observac?.trim() || null,
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("ingredient_recipes").insert(rows);
      if (error) {
        console.warn(`    ✗ Sub-receta código ${parentCode}: ${error.message}`);
      } else {
        compositeCount++;
        subRecipeLinesCreated += rows.length;
      }
    }
  }

  console.log(`  ✓ ${compositeCount} ingredientes compuestos marcados`);
  console.log(`  ✓ ${subRecipeLinesCreated} líneas de sub-receta creadas`);
  if (subRecipeSkipped > 0) {
    console.log(`  ⚠ ${subRecipeSkipped} sub-recetas omitidas (ingrediente padre no encontrado)`);
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\n━━━ Import completo ━━━`);
  console.log(`  Ingredientes: ${ingCreated} (${compositeCount} compuestos)`);
  console.log(`  Presentaciones: ${presCreated}`);
  console.log(`  Recetas: ${recipesCreated}`);
  console.log(`  Sub-recetas: ${subRecipeLinesCreated} líneas`);
  console.log(`  Sin match: ${unmatchedProducts.length}`);
  console.log(`\n  Ver en: /${BUSINESS_SLUG}/admin/catalogo (tabs Insumos y Costeo)\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
