/**
 * Extract ingredient and recipe data from Maxirest SQL dump and generate
 * TypeScript arrays for seed-data.ts.
 *
 * Run: node scripts/extract-maxirest.mjs
 * Output: scripts/extracted-maxirest-data.txt
 */

import { createReadStream, writeFileSync } from "fs";
import { createInterface } from "readline";

const SQL_PATH =
  "C:\\Users\\juanc\\Desktop\\GPSF\\Exp\\MaxiRESTSQL\\ResguardoBD\\20251223_10-03-34\\resguardo_mx_maxirest_20251223_10-03-34.sql";

// Read only specific lines we need (file is too large for readFileSync)
const TARGET_LINES = { 786: null, 5261: null, 8814: null }; // 1-indexed
const rl = createInterface({ input: createReadStream(SQL_PATH, "latin1"), crlfDelay: Infinity });
let lineNum = 0;
for await (const line of rl) {
  lineNum++;
  if (TARGET_LINES.hasOwnProperty(lineNum)) TARGET_LINES[lineNum] = line;
  if (lineNum > 8820) break;
}

// ═══════════════════════════════════════════════════════════════════
// 1. Parse mxins (ingredients) — line 5261
// ═══════════════════════════════════════════════════════════════════
const mxinsRaw = TARGET_LINES[5261];
const mxinsData = mxinsRaw.replace(/^INSERT INTO `mxins` VALUES /, "");
const insTuples = [...mxinsData.matchAll(/\(([^)]+)\)/g)];

const ingredients = new Map();
for (const t of insTuples) {
  const vals = [...t[1].matchAll(/'[^']*'|[^,]+/g)].map((m) =>
    m[0].replace(/^'|'$/g, "")
  );
  const id = parseInt(vals[0]);
  const name = vals[3];
  const rubro = parseInt(vals[4]) || 0;
  const unit = vals[5];
  const price = parseFloat(vals[6]) || 0;
  const envase = vals[11];
  const neto = parseFloat(vals[12]) || 0;
  const precioEnv = parseFloat(vals[13]) || 0;
  const desp = parseFloat(vals[20]) || 0;
  if (name && name.trim() !== "") {
    ingredients.set(id, { id, name, rubro, unit, price, envase, neto, precioEnv, desp });
  }
}

// ═══════════════════════════════════════════════════════════════════
// 2. Parse mxart (articles) — line 786 (0-indexed 785)
// ═══════════════════════════════════════════════════════════════════
const mxartRaw = TARGET_LINES[786];
const mxartData = mxartRaw.replace(/^INSERT INTO `mxart` VALUES /, "");

const articles = new Map();
let pos = 0;
while (pos < mxartData.length) {
  const start = mxartData.indexOf("(", pos);
  if (start < 0) break;
  let depth = 0, inQ = false, end = start;
  for (let ci = start; ci < mxartData.length; ci++) {
    const ch = mxartData[ci];
    if (ch === "'" && !inQ) { inQ = true; continue; }
    if (ch === "'" && inQ) { inQ = false; continue; }
    if (!inQ) {
      if (ch === "(") depth++;
      if (ch === ")") { depth--; if (depth === 0) { end = ci; break; } }
    }
  }
  const tuple = mxartData.substring(start + 1, end);
  pos = end + 1;
  const vals = [...tuple.matchAll(/'(?:[^'\\]|\\.)*'|[^,]+/g)].map((m) =>
    m[0].replace(/^'|'$/g, "")
  );
  if (vals.length >= 4) {
    const id = parseInt(vals[0]);
    const name = vals[3];
    if (name && name.trim() !== "") articles.set(id, name);
  }
}

// ═══════════════════════════════════════════════════════════════════
// 3. Parse mxrec (recipes) — line 8814 (0-indexed 8813)
// ═══════════════════════════════════════════════════════════════════
const mxrecRaw = TARGET_LINES[8814];
const mxrecData = mxrecRaw.replace(/^INSERT INTO `mxrec` VALUES /, "");
const recTuples = [...mxrecData.matchAll(/\(([^)]+)\)/g)];

const recipeLines = [];
const subRecipeLines = [];
for (const t of recTuples) {
  const vals = [...t[1].matchAll(/'[^']*'|[^,]+/g)].map((m) =>
    m[0].replace(/^'|'$/g, "")
  );
  const codArt = parseInt(vals[1]);
  const codIns = parseInt(vals[2]);
  const cantidad = parseFloat(vals[3]);
  if (codIns > 0 && cantidad > 0) {
    if (codArt < 0) {
      subRecipeLines.push({ codArt, insId: Math.abs(codArt), codIns, cantidad });
    } else {
      recipeLines.push({ codArt, codIns, cantidad });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// 4. Curated INGREDIENTS (~105 items)
// ═══════════════════════════════════════════════════════════════════
// Each entry: [mxins_id, display_name, unit, waste%, stock, min_alert, [{name, nq, cc}]]
// Prices from Maxirest are ARS late 2025. Multiply by 100 for cents.
const CURATED = [
  // ── Carnes ──
  [9,   "Entrecot",              "kg", 12, 18, 5,  [{ name: "Compra 10kg", nq: 10, cc: 15100_00 }]],
  [11,  "Lomo",                  "kg", 10, 12, 4,  [{ name: "Pieza 5kg", nq: 5, cc: 21000_00 }]],
  [12,  "Entraña",               "kg", 8,  8,  3,  [{ name: "Pieza 3kg", nq: 3, cc: 21000_00 }]],
  [27,  "Ojo de bife",           "kg", 8,  10, 3,  [{ name: "Pieza 5kg", nq: 5, cc: 19638_00 }]],
  [24,  "Matambre de vaca",      "kg", 10, 8,  3,  [{ name: "Pieza 3kg", nq: 3, cc: 18200_00 }]],
  [14,  "Matambre de cerdo",     "kg", 8,  6,  2,  [{ name: "Pieza 3kg", nq: 3, cc: 11240_00 }]],
  [10,  "Nalga",                 "kg", 10, 10, 3,  [{ name: "Pieza 5kg", nq: 5, cc: 18000_00 }]],
  [7,   "Costilla asado",        "kg", 18, 25, 8,  [{ name: "Compra 10kg", nq: 10, cc: 17900_00 }]],
  [8,   "Carne picada",          "kg", 5,  8,  3,  [{ name: "Compra 5kg", nq: 5, cc: 9200_00 }]],
  [22,  "Chorizo",               "kg", 5,  6,  2,  [{ name: "Compra 3kg", nq: 3, cc: 8672_00 }]],
  [21,  "Morcilla",              "kg", 5,  5,  2,  [{ name: "Compra 3kg", nq: 3, cc: 3830_00 }]],
  [23,  "Molleja",               "kg", 15, 5,  2,  [{ name: "Compra 2kg", nq: 2, cc: 26500_00 }]],
  [26,  "Chinchulines",          "kg", 20, 4,  2,  [{ name: "Compra 2kg", nq: 2, cc: 6800_00 }]],
  [25,  "Peceto",                "kg", 8,  5,  2,  [{ name: "Pieza 3kg", nq: 3, cc: 18200_00 }]],
  [20,  "Solomillo",             "kg", 8,  5,  2,  [{ name: "Pieza 2kg", nq: 2, cc: 9047_00 }]],
  [16,  "Bondiola de cerdo",     "kg", 10, 5,  2,  [{ name: "Pieza 3kg", nq: 3, cc: 8150_00 }]],
  [15,  "Carré de cerdo",        "kg", 10, 4,  2,  [{ name: "Pieza 3kg", nq: 3, cc: 5673_00 }]],
  [18,  "Costilla de cerdo",     "kg", 12, 6,  2,  [{ name: "Compra 5kg", nq: 5, cc: 7699_00 }]],
  [17,  "Churrasquito",          "kg", 8,  4,  2,  [{ name: "Compra 3kg", nq: 3, cc: 10030_00 }]],
  [289, "Osobuco",               "kg", 10, 4,  2,  [{ name: "Compra 3kg", nq: 3, cc: 7602_00 }]],
  [48,  "Pollo entero",          "kg", 25, 10, 3,  [{ name: "Unidad 2.5kg", nq: 2.5, cc: 3000_00 }]],
  [46,  "Pechuga de pollo",      "kg", 5,  8,  3,  [{ name: "Compra 5kg", nq: 5, cc: 4667_00 }]],
  // ── Pescados ──
  [29,  "Filet de salmón",       "kg", 5,  4,  2,  [{ name: "Compra 2kg", nq: 2, cc: 15900_00 }]],
  [30,  "Langostinos pelados",   "kg", 5,  3,  1,  [{ name: "Bolsa 1kg", nq: 1, cc: 17900_00 }]],
  [32,  "Calamaretes",           "kg", 10, 4,  2,  [{ name: "Bolsa 2kg", nq: 2, cc: 15900_00 }]],
  [33,  "Tubo de calamar",       "kg", 10, 3,  1,  [{ name: "Bolsa 2kg", nq: 2, cc: 16900_00 }]],
  [39,  "Filet de merluza",      "kg", 5,  5,  2,  [{ name: "Compra 3kg", nq: 3, cc: 5900_00 }]],
  [31,  "Boga despinada",        "kg", 5,  3,  1,  [{ name: "Compra 2kg", nq: 2, cc: 11900_00 }]],
  [287, "Filet de abadejo",      "kg", 5,  3,  1,  [{ name: "Compra 2kg", nq: 2, cc: 18900_00 }]],
  [189, "Pacú",                  "kg", 15, 3,  1,  [{ name: "Compra 2kg", nq: 2, cc: 12800_00 }]],
  [35,  "Salmón entero",         "kg", 30, 3,  1,  [{ name: "Pieza 4kg", nq: 4, cc: 16900_00 }]],
  // ── Lácteos ──
  [157, "Muzarella",             "kg", 2,  8,  3,  [{ name: "Barra 5kg", nq: 5, cc: 8000_00 }]],
  [158, "Queso provolone",       "kg", 2,  4,  2,  [{ name: "Horma 4kg", nq: 4, cc: 15600_00 }]],
  [151, "Queso barra",           "kg", 2,  6,  2,  [{ name: "Barra 4kg", nq: 4, cc: 8000_00 }]],
  [153, "Queso azul",            "kg", 3,  3,  1,  [{ name: "Horma 2kg", nq: 2, cc: 12400_00 }]],
  [154, "Queso sardo",           "kg", 3,  3,  1,  [{ name: "Horma 3kg", nq: 3, cc: 12900_00 }]],
  [150, "Queso crema",           "kg", 2,  3,  1,  [{ name: "Pote 3.5kg", nq: 3.5, cc: 6406_00 }]],
  [155, "Crema de leche",        "lt", 0,  6,  2,  [{ name: "Sachet 1lt", nq: 1, cc: 6300_00 }]],
  [159, "Manteca",               "kg", 0,  3,  1,  [{ name: "Pan 200g", nq: 0.2, cc: Math.round(10848_00 * 0.2) }]],
  [160, "Bocconcinos",           "kg", 2,  2,  1,  [{ name: "Pote 1kg", nq: 1, cc: 14739_00 }]],
  [77,  "Leche",                 "lt", 0, 10,  3,  [{ name: "Sachet 1lt", nq: 1, cc: 1342_00 }]],
  // ── Fiambres ──
  [44,  "Jamón crudo",           "kg", 3,  5,  2,  [{ name: "Pieza 4kg", nq: 4, cc: 21500_00 }]],
  [45,  "Jamón cocido",          "kg", 3,  5,  2,  [{ name: "Pieza 4kg", nq: 4, cc: 9412_00 }]],
  [41,  "Panceta ahumada",       "kg", 5,  3,  1,  [{ name: "Pieza 2kg", nq: 2, cc: 18240_00 }]],
  [42,  "Salame bastón",         "kg", 3,  3,  1,  [{ name: "Pieza 2kg", nq: 2, cc: 12404_00 }]],
  // ── Verduras ──
  [108, "Papa",                  "kg", 15, 50, 10, [{ name: "Bolsa 50kg", nq: 50, cc: 1000_00 }]],
  [131, "Tomate",                "kg", 10, 12, 4,  [{ name: "Cajón 20kg", nq: 20, cc: 2250_00 }]],
  [140, "Tomate cherry",         "kg", 5,  3,  1,  [{ name: "Bandeja 250g", nq: 0.25, cc: Math.round(8000_00 * 0.25) }]],
  [118, "Lechuga",               "kg", 20, 5,  2,  [{ name: "Cajón 3kg", nq: 3, cc: 3150_00 }]],
  [115, "Rúcula",                "kg", 15, 3,  1,  [{ name: "Atado 250g", nq: 0.25, cc: Math.round(12500_00 * 0.25) }]],
  [111, "Cebolla",               "kg", 10, 15, 5,  [{ name: "Bolsa 10kg", nq: 10, cc: 500_00 }]],
  [114, "Espinaca",              "kg", 15, 5,  2,  [{ name: "Atado 1kg", nq: 1, cc: 3500_00 }]],
  [112, "Calabaza",              "kg", 15, 5,  2,  [{ name: "Unidad 3kg", nq: 3, cc: 667_00 }]],
  [109, "Zanahoria",             "kg", 12, 8,  3,  [{ name: "Bolsa 5kg", nq: 5, cc: 700_00 }]],
  [127, "Pimiento rojo",         "kg", 12, 4,  2,  [{ name: "Cajón 5kg", nq: 5, cc: 6000_00 }]],
  [125, "Limón",                 "kg", 10, 5,  2,  [{ name: "Cajón 10kg", nq: 10, cc: 1250_00 }]],
  [138, "Manzana roja",          "kg", 8,  5,  2,  [{ name: "Cajón 10kg", nq: 10, cc: 2009_00 }]],
  [121, "Manzana verde",         "kg", 8,  5,  2,  [{ name: "Cajón 10kg", nq: 10, cc: 2998_00 }]],
  [123, "Pera",                  "kg", 10, 4,  2,  [{ name: "Cajón 10kg", nq: 10, cc: 1813_00 }]],
  [146, "Frutillas",             "kg", 8,  3,  1,  [{ name: "Bandeja 1kg", nq: 1, cc: 3571_00 }]],
  [142, "Champiñones",           "kg", 5,  3,  1,  [{ name: "Bandeja 200g", nq: 0.2, cc: Math.round(9800_00 * 0.2) }]],
  [117, "Puerro",                "kg", 15, 2,  1,  [{ name: "Atado 500g", nq: 0.5, cc: Math.round(12000_00 * 0.5) }]],
  [135, "Apio",                  "kg", 20, 2,  1,  [{ name: "Atado 500g", nq: 0.5, cc: Math.round(3000_00 * 0.5) }]],
  [113, "Acelga",                "kg", 15, 3,  1,  [{ name: "Atado 1kg", nq: 1, cc: 2222_00 }]],
  [137, "Cebolla de verdeo",     "kg", 15, 2,  1,  [{ name: "Atado 250g", nq: 0.25, cc: Math.round(24000_00 * 0.25) }]],
  [130, "Berenjena",             "kg", 10, 3,  1,  [{ name: "Cajón 5kg", nq: 5, cc: 2524_00 }]],
  [144, "Albahaca",              "kg", 20, 1,  0.5,[{ name: "Atado 100g", nq: 0.1, cc: Math.round(20000_00 * 0.1) }]],
  [133, "Perejil",               "kg", 20, 1,  0.5,[{ name: "Atado 100g", nq: 0.1, cc: Math.round(8333_00 * 0.1) }]],
  [141, "Ajo",                   "un", 5,  20, 5,  [{ name: "Trenza 10 un", nq: 10, cc: 700_00 }]],
  // ── Varios (despensa) ──
  [47,  "Huevos",                "un", 3,  120, 30,[{ name: "Maple 30 un", nq: 30, cc: Math.round(192_00 * 30) }]],
  [107, "Aceite de girasol",     "lt", 0,  30, 5,  [{ name: "Bidón 5lt", nq: 5, cc: 2974_00 }]],
  [68,  "Aceite de oliva",       "lt", 0,  5,  2,  [{ name: "Botella 500ml", nq: 0.5, cc: Math.round(17380_00 * 0.5) }]],
  [62,  "Harina 0000",           "kg", 1,  45, 10, [{ name: "Bolsa 25kg", nq: 25, cc: 820_00 }]],
  [67,  "Rebozador",             "kg", 2,  8,  3,  [{ name: "Bolsa 1kg", nq: 1, cc: 2283_00 }]],
  [61,  "Azúcar",                "kg", 0,  10, 3,  [{ name: "Bolsa 5kg", nq: 5, cc: 1116_00 }]],
  [80,  "Sal fina",              "kg", 0,  10, 3,  [{ name: "Bolsa 1kg", nq: 1, cc: 2087_00 }]],
  [81,  "Sal parrillera",        "kg", 0,  10, 3,  [{ name: "Bolsa 1kg", nq: 1, cc: 1796_00 }]],
  [65,  "Dulce de leche",        "kg", 0,  4,  1,  [{ name: "Balde 5kg", nq: 5, cc: 4451_00 }]],
  [78,  "Arroz",                 "kg", 2,  10, 3,  [{ name: "Bolsa 5kg", nq: 5, cc: 1615_00 }]],
  [49,  "Mayonesa",              "kg", 0,  5,  2,  [{ name: "Balde 3kg", nq: 3, cc: 4056_00 }]],
  [63,  "Maicena",               "kg", 0,  3,  1,  [{ name: "Paquete 500g", nq: 0.5, cc: Math.round(4848_00 * 0.5) }]],
  [93,  "Salsa demiglasé",       "kg", 0,  2,  1,  [{ name: "Frasco 500g", nq: 0.5, cc: Math.round(14887_00 * 0.5) }]],
  [95,  "Chocolate negro",       "kg", 0,  2,  1,  [{ name: "Caja 1kg", nq: 1, cc: 13409_00 }]],
  [103, "Vainillas",             "kg", 0,  2,  1,  [{ name: "Paquete 500g", nq: 0.5, cc: Math.round(1513_00 * 0.5) }]],
  [101, "Nueces",                "kg", 5,  2,  1,  [{ name: "Bolsa 1kg", nq: 1, cc: 17995_00 }]],
  [90,  "Aceitunas verdes",      "kg", 0,  3,  1,  [{ name: "Lata 1kg", nq: 1, cc: 7251_00 }]],
  [91,  "Aceitunas negras",      "kg", 0,  3,  1,  [{ name: "Lata 1kg", nq: 1, cc: 12386_00 }]],
  [79,  "Aceto balsámico",       "lt", 0,  2,  1,  [{ name: "Botella 250ml", nq: 0.25, cc: Math.round(9750_00 * 0.25) }]],
  [92,  "Salsa barbacoa",        "ml", 0,  2000, 500, [{ name: "Botella 500ml", nq: 500, cc: 4013_00 }]],
  [82,  "Orégano",               "kg", 0,  1,  0.5,[{ name: "Paquete 100g", nq: 0.1, cc: 3000_00 }]],
  [66,  "Discos de empanada",    "un", 2,  48, 12, [{ name: "Paquete 12 un", nq: 12, cc: Math.round(108_00 * 12) }]],
  [74,  "Atún desmenuzado",      "kg", 0,  3,  1,  [{ name: "Lata 170g", nq: 0.17, cc: Math.round(7919_00 * 0.17) }]],
  [105, "Vino tinto (cocina)",   "lt", 0,  5,  2,  [{ name: "Botella 750ml", nq: 0.75, cc: Math.round(1953_00 * 0.75) }]],
  [106, "Vino blanco (cocina)",  "lt", 0,  5,  2,  [{ name: "Botella 750ml", nq: 0.75, cc: Math.round(1733_00 * 0.75) }]],
  [51,  "Tomate deshidratado",   "kg", 0,  2,  1,  [{ name: "Bolsa 1kg", nq: 1, cc: 25932_00 }]],
  [52,  "Caldo de verduras",     "kg", 0,  2,  1,  [{ name: "Frasco 500g", nq: 0.5, cc: Math.round(16740_00 * 0.5) }]],
  [38,  "Anchoas en aceite",     "kg", 0,  1,  0.5,[{ name: "Lata 100g", nq: 0.1, cc: Math.round(48900_00 * 0.1) }]],
  [100, "Hongos de pino",        "kg", 5,  1,  0.5,[{ name: "Frasco 200g", nq: 0.2, cc: Math.round(23443_00 * 0.2) }]],
  [75,  "Alcaparras",            "kg", 0,  1,  0.5,[{ name: "Frasco 200g", nq: 0.2, cc: Math.round(14461_00 * 0.2) }]],
  [194, "Panko",                 "kg", 0,  2,  1,  [{ name: "Bolsa 1kg", nq: 1, cc: 10000_00 }]],
  [69,  "Mostaza",               "kg", 0,  2,  1,  [{ name: "Frasco 500g", nq: 0.5, cc: Math.round(2560_00 * 0.5) }]],
  [104, "Vinagre de alcohol",    "lt", 0,  3,  1,  [{ name: "Botella 1lt", nq: 1, cc: 1157_00 }]],
  // ── Pastas y salsas pre-elaboradas (composite ingredients) ──
  [19,  "Ñoquis de papa",        "un", 10, 20, 5,  [{ name: "Porción", nq: 1, cc: 1177_00 }]],
  [164, "Masa pastas frescas",   "un", 6,  15, 5,  [{ name: "Porción", nq: 1, cc: 452_00 }]],
  [163, "Masa pastas rellenas",  "un", 10, 15, 5,  [{ name: "Porción", nq: 1, cc: 179_00 }]],
  [180, "Ravioles de verdura",   "un", 9,  10, 3,  [{ name: "Porción", nq: 1, cc: 778_00 }]],
  [181, "Sorrentinos JyQ",       "un", 5,  10, 3,  [{ name: "Porción", nq: 1, cc: 1612_00 }]],
  [182, "Sorrentinos de calabaza","un", 5,  8,  3,  [{ name: "Porción", nq: 1, cc: 1035_00 }]],
  [183, "Sorrentinos de salmón", "un", 5,  6,  2,  [{ name: "Porción", nq: 1, cc: 2483_00 }]],
  [168, "Crepe",                 "un", 25, 20, 5,  [{ name: "Unidad", nq: 1, cc: 56_00 }]],
  [170, "Salsa tuco",            "un", 20, 15, 5,  [{ name: "Porción (base: 20 platos)", nq: 1, cc: 1920_00 }]],
  [171, "Salsa bolognesa",       "un", 20, 10, 3,  [{ name: "Porción (base: 20 platos)", nq: 1, cc: 3480_00 }]],
  [169, "Salsa crema",           "un", 0,  15, 5,  [{ name: "Porción (base: 200 platos)", nq: 1, cc: 383_00 }]],
  [172, "Salsa blanca",          "un", 10, 10, 3,  [{ name: "Porción", nq: 1, cc: 158_00 }]],
  [178, "Salsa 4 quesos",        "un", 0,  8,  3,  [{ name: "Porción", nq: 1, cc: 1610_00 }]],
  // ── Panes ──
  [174, "Pan de mesa",           "kg", 5,  10, 3,  [{ name: "Bolsa 1kg", nq: 1, cc: 2500_00 }]],
  [175, "Pan de miga",           "un", 5,  40, 10, [{ name: "Paquete 20 un", nq: 20, cc: Math.round(400_00 * 20) }]],
  [176, "Pan lactal",            "kg", 5,  5,  2,  [{ name: "Paquete 500g", nq: 0.5, cc: 1500_00 }]],
  [177, "Pan de lomo",           "un", 3,  30, 10, [{ name: "Bolsa 10 un", nq: 10, cc: Math.round(500_00 * 10) }]],
  [166, "Galletitas de agua",    "kg", 0,  3,  1,  [{ name: "Paquete 300g", nq: 0.3, cc: 800_00 }]],
  [57,  "Espinaca congelada",    "kg", 0,  5,  2,  [{ name: "Bolsa 1kg", nq: 1, cc: 5611_00 }]],
  [179, "Puré de manzana",       "un", 0,  5,  2,  [{ name: "Porción", nq: 1, cc: 500_00 }]],
];

// ═══════════════════════════════════════════════════════════════════
// 5. Curated RECIPES
// ═══════════════════════════════════════════════════════════════════
const RECIPE_MAP = [
  // ── Parrilla (simple grills) ──
  { product: "Entrecot",           lines: [{ ins: "Entrecot", qty: 0.330 }, { ins: "Sal parrillera", qty: 0.001 }] },
  { product: "Lomo",               lines: [{ ins: "Lomo", qty: 0.350 }, { ins: "Sal parrillera", qty: 0.001 }] },
  { product: "Petit Lomo",         lines: [{ ins: "Lomo", qty: 0.250 }, { ins: "Sal parrillera", qty: 0.001 }] },
  { product: "Ojo de Bife",        lines: [{ ins: "Ojo de bife", qty: 0.650 }, { ins: "Sal parrillera", qty: 0.001 }] },
  { product: "Matambrito",         lines: [{ ins: "Matambre de cerdo", qty: 0.360 }, { ins: "Sal parrillera", qty: 0.001 }] },
  { product: "Asado de Tira",      lines: [{ ins: "Costilla asado", qty: 0.780 }, { ins: "Sal parrillera", qty: 0.001 }] },
  { product: "Entraña",            lines: [{ ins: "Entraña", qty: 0.400 }, { ins: "Sal parrillera", qty: 0.001 }] },
  { product: "Chorizo",            lines: [{ ins: "Chorizo", qty: 0.180 }] },
  { product: "Morcilla",           lines: [{ ins: "Morcilla", qty: 0.110 }] },
  { product: "Molleja",            lines: [{ ins: "Molleja", qty: 0.300 }, { ins: "Sal parrillera", qty: 0.001 }] },
  { product: "Chinchulines",       lines: [{ ins: "Chinchulines", qty: 0.300 }, { ins: "Sal parrillera", qty: 0.001 }] },
  { product: "Filet de Pollo",     lines: [{ ins: "Pechuga de pollo", qty: 0.320 }, { ins: "Sal parrillera", qty: 0.001 }] },
  { product: "Salmón Grillé",      lines: [{ ins: "Salmón entero", qty: 0.310 }, { ins: "Sal parrillera", qty: 0.001 }] },
  { product: "Dorado",             lines: [{ ins: "Pacú", qty: 0.500 }, { ins: "Sal parrillera", qty: 0.001 }] },
  { product: "Pacú Grillado",      lines: [{ ins: "Pacú", qty: 0.600 }, { ins: "Sal parrillera", qty: 0.001 }] },
  { product: "Boga Despinada",     lines: [{ ins: "Boga despinada", qty: 1.200 }, { ins: "Sal parrillera", qty: 0.001 }] },
  { product: "Brochette de Lomo",  lines: [{ ins: "Lomo", qty: 0.300 }, { ins: "Pimiento rojo", qty: 0.080 }, { ins: "Cebolla", qty: 0.060 }] },
  { product: "Brochette de Pollo", lines: [{ ins: "Pechuga de pollo", qty: 0.300 }, { ins: "Pimiento rojo", qty: 0.080 }, { ins: "Cebolla", qty: 0.060 }] },
  { product: "Provoleta",          lines: [{ ins: "Queso provolone", qty: 0.280 }, { ins: "Aceite de oliva", qty: 0.012 }, { ins: "Orégano", qty: 0.010 }] },
  { product: "Provoleta Especial", lines: [{ ins: "Queso provolone", qty: 0.280 }, { ins: "Tomate", qty: 0.200 }, { ins: "Rúcula", qty: 0.020 }, { ins: "Orégano", qty: 0.001 }, { ins: "Jamón crudo", qty: 0.055 }] },
  { product: "Choripán",           lines: [{ ins: "Chorizo", qty: 0.180 }, { ins: "Pan de mesa", qty: 0.100 }] },
  { product: "Ensalada Tibia",     lines: [{ ins: "Queso azul", qty: 0.060 }, { ins: "Pera", qty: 0.100 }, { ins: "Panceta ahumada", qty: 0.080 }, { ins: "Rúcula", qty: 0.100 }, { ins: "Lechuga", qty: 0.060 }, { ins: "Queso sardo", qty: 0.050 }, { ins: "Nueces", qty: 0.020 }] },

  // ── Milanesas y fritos ──
  { product: "Milanesa",           lines: [{ ins: "Nalga", qty: 0.180 }, { ins: "Huevos", qty: 1 }, { ins: "Rebozador", qty: 0.010 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Milanesa Napolitana", lines: [{ ins: "Nalga", qty: 0.180 }, { ins: "Huevos", qty: 1 }, { ins: "Rebozador", qty: 0.010 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Jamón cocido", qty: 0.120 }, { ins: "Muzarella", qty: 0.080 }, { ins: "Salsa tuco", qty: 1 }, { ins: "Orégano", qty: 0.005 }] },
  { product: "Milanesa Florentina", lines: [{ ins: "Nalga", qty: 0.180 }, { ins: "Huevos", qty: 1 }, { ins: "Rebozador", qty: 0.010 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Espinaca congelada", qty: 0.150 }, { ins: "Queso sardo", qty: 0.050 }] },
  { product: "Milanesa Entrecot",  lines: [{ ins: "Entrecot", qty: 0.330 }, { ins: "Huevos", qty: 1 }, { ins: "Rebozador", qty: 0.010 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Milanesa Entrecot Napolitana", lines: [{ ins: "Entrecot", qty: 0.330 }, { ins: "Huevos", qty: 1 }, { ins: "Rebozador", qty: 0.010 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Jamón cocido", qty: 0.120 }, { ins: "Muzarella", qty: 0.080 }, { ins: "Salsa tuco", qty: 1 }, { ins: "Orégano", qty: 0.005 }] },
  { product: "Suprema",            lines: [{ ins: "Pechuga de pollo", qty: 0.320 }, { ins: "Huevos", qty: 1 }, { ins: "Rebozador", qty: 0.010 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Suprema Napolitana", lines: [{ ins: "Pechuga de pollo", qty: 0.320 }, { ins: "Huevos", qty: 1 }, { ins: "Rebozador", qty: 0.010 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Jamón cocido", qty: 0.120 }, { ins: "Muzarella", qty: 0.080 }, { ins: "Salsa tuco", qty: 1 }, { ins: "Orégano", qty: 0.005 }] },
  { product: "Merluza Romana",     lines: [{ ins: "Filet de merluza", qty: 0.360 }, { ins: "Huevos", qty: 1 }, { ins: "Harina 0000", qty: 0.015 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Rabas",              lines: [{ ins: "Tubo de calamar", qty: 0.400 }, { ins: "Harina 0000", qty: 0.025 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Langostinos",        lines: [{ ins: "Langostinos pelados", qty: 0.380 }, { ins: "Huevos", qty: 1 }, { ins: "Panko", qty: 0.060 }, { ins: "Aceite de oliva", qty: 0.012 }, { ins: "Papa", qty: 0.175 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Revuelto Gramajo",   lines: [{ ins: "Huevos", qty: 4 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Jamón cocido", qty: 0.080 }, { ins: "Queso barra", qty: 0.060 }, { ins: "Papa", qty: 0.200 }] },

  // ── Tortillas y omelettes ──
  { product: "Tortilla Papas",     lines: [{ ins: "Huevos", qty: 4 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Papa", qty: 0.350 }, { ins: "Cebolla", qty: 0.120 }, { ins: "Queso sardo", qty: 0.060 }] },
  { product: "Tortilla c/Camarones", lines: [{ ins: "Huevos", qty: 4 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Langostinos pelados", qty: 0.140 }, { ins: "Espinaca congelada", qty: 0.340 }, { ins: "Cebolla", qty: 0.120 }, { ins: "Queso sardo", qty: 0.060 }] },
  { product: "Tortilla Espinaca",  lines: [{ ins: "Huevos", qty: 4 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Espinaca congelada", qty: 0.340 }, { ins: "Cebolla", qty: 0.120 }, { ins: "Queso sardo", qty: 0.060 }] },
  { product: "Omelette",           lines: [{ ins: "Huevos", qty: 3 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Jamón cocido", qty: 0.060 }, { ins: "Queso barra", qty: 0.050 }] },
  { product: "Omelette Caprese",   lines: [{ ins: "Huevos", qty: 3 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Bocconcinos", qty: 0.080 }, { ins: "Tomate cherry", qty: 0.060 }, { ins: "Albahaca", qty: 0.010 }] },
  { product: "Omelette Espinacas y Queso Azul", lines: [{ ins: "Huevos", qty: 3 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Espinaca congelada", qty: 0.150 }, { ins: "Queso azul", qty: 0.050 }] },
  { product: "Omelette Verdura",   lines: [{ ins: "Huevos", qty: 3 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Calabaza", qty: 0.080 }, { ins: "Cebolla", qty: 0.040 }, { ins: "Pimiento rojo", qty: 0.040 }] },

  // ── Papas ──
  { product: "Papas Fritas",       lines: [{ ins: "Papa", qty: 0.350 }, { ins: "Aceite de girasol", qty: 0.100 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Papas c/Crema",      lines: [{ ins: "Papa", qty: 0.350 }, { ins: "Aceite de girasol", qty: 0.100 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Crema de leche", qty: 0.050 }] },
  { product: "Papas Provenzal",    lines: [{ ins: "Papa", qty: 0.350 }, { ins: "Aceite de girasol", qty: 0.100 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Ajo", qty: 0.100 }, { ins: "Perejil", qty: 0.010 }] },
  { product: "Papas Rejilla",      lines: [{ ins: "Papa", qty: 0.350 }, { ins: "Aceite de girasol", qty: 0.120 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Papas Española",     lines: [{ ins: "Papa", qty: 0.350 }, { ins: "Huevos", qty: 2 }, { ins: "Cebolla", qty: 0.080 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Papas Gratinadas",   lines: [{ ins: "Papa", qty: 0.350 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Salsa crema", qty: 1 }, { ins: "Queso sardo", qty: 0.060 }] },
  { product: "Papas a Caballo",    lines: [{ ins: "Papa", qty: 0.350 }, { ins: "Aceite de girasol", qty: 0.100 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Huevos", qty: 2 }] },
  { product: "Puré",               lines: [{ ins: "Papa", qty: 1.000 }, { ins: "Manteca", qty: 0.100 }, { ins: "Leche", qty: 0.150 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Puré de Manzana",    lines: [{ ins: "Manzana verde", qty: 0.400 }, { ins: "Manteca", qty: 0.050 }, { ins: "Azúcar", qty: 0.150 }] },
  { product: "Espinaca Gratén",    lines: [{ ins: "Espinaca congelada", qty: 0.340 }, { ins: "Queso sardo", qty: 0.080 }, { ins: "Salsa crema", qty: 1 }, { ins: "Sal fina", qty: 0.001 }] },

  // ── Ensaladas ──
  { product: "Ensalada Caprese",   lines: [{ ins: "Bocconcinos", qty: 0.150 }, { ins: "Tomate cherry", qty: 0.120 }, { ins: "Aceitunas negras", qty: 0.030 }, { ins: "Albahaca", qty: 0.080 }] },
  { product: "Ensalada Pollo Rebozado", lines: [{ ins: "Pechuga de pollo", qty: 0.180 }, { ins: "Rebozador", qty: 0.010 }, { ins: "Huevos", qty: 1 }, { ins: "Rúcula", qty: 0.100 }, { ins: "Lechuga", qty: 0.060 }, { ins: "Queso sardo", qty: 0.050 }] },
  { product: "Vithel Tonné",       lines: [{ ins: "Peceto", qty: 2.800 }, { ins: "Mayonesa", qty: 0.500 }, { ins: "Crema de leche", qty: 0.250 }, { ins: "Mostaza", qty: 0.050 }, { ins: "Vinagre de alcohol", qty: 0.015 }, { ins: "Anchoas en aceite", qty: 0.035 }, { ins: "Atún desmenuzado", qty: 0.280 }] },
  { product: "Arrollado Casero",   lines: [{ ins: "Matambre de vaca", qty: 2.650 }, { ins: "Huevos", qty: 8 }, { ins: "Queso sardo", qty: 0.100 }, { ins: "Rebozador", qty: 0.025 }, { ins: "Perejil", qty: 0.015 }, { ins: "Aceitunas verdes", qty: 0.015 }, { ins: "Jamón cocido", qty: 0.125 }, { ins: "Queso barra", qty: 0.125 }, { ins: "Pimiento rojo", qty: 0.150 }, { ins: "Zanahoria", qty: 0.100 }, { ins: "Acelga", qty: 0.350 }] },

  // ── Pastas ──
  { product: "Ñoquis",             lines: [{ ins: "Ñoquis de papa", qty: 1 }, { ins: "Queso sardo", qty: 0.050 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Tallarines",         lines: [{ ins: "Masa pastas frescas", qty: 1 }, { ins: "Queso sardo", qty: 0.050 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Ravioles",           lines: [{ ins: "Ravioles de verdura", qty: 1 }, { ins: "Queso sardo", qty: 0.050 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Sorrentinos Jamón y Queso", lines: [{ ins: "Sorrentinos JyQ", qty: 1 }, { ins: "Queso sardo", qty: 0.050 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Sorrentinos Calabaza", lines: [{ ins: "Sorrentinos de calabaza", qty: 1 }, { ins: "Queso sardo", qty: 0.050 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Sorrentinos Salmón c/Tinta", lines: [{ ins: "Sorrentinos de salmón", qty: 1 }, { ins: "Queso sardo", qty: 0.050 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Crepes de Verdura",  lines: [{ ins: "Crepe", qty: 2 }, { ins: "Pimiento rojo", qty: 0.050 }, { ins: "Acelga", qty: 0.250 }, { ins: "Cebolla", qty: 0.050 }, { ins: "Leche", qty: 0.150 }, { ins: "Harina 0000", qty: 0.050 }, { ins: "Queso barra", qty: 0.100 }, { ins: "Queso sardo", qty: 0.050 }, { ins: "Aceite de girasol", qty: 0.020 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Lasagna",            lines: [{ ins: "Masa pastas frescas", qty: 1 }, { ins: "Salsa bolognesa", qty: 2 }, { ins: "Salsa blanca", qty: 1 }, { ins: "Queso sardo", qty: 0.080 }, { ins: "Sal fina", qty: 0.001 }] },

  // ── Salsas (as products — user picks sauce on pastas) ──
  { product: "Bolognesa",          lines: [{ ins: "Salsa bolognesa", qty: 2 }, { ins: "Queso sardo", qty: 0.050 }] },
  { product: "Cuatro Quesos",      lines: [{ ins: "Salsa 4 quesos", qty: 1 }, { ins: "Queso sardo", qty: 0.050 }] },
  { product: "Pesto",              lines: [{ ins: "Albahaca", qty: 0.100 }, { ins: "Ajo", qty: 0.050 }, { ins: "Nueces", qty: 0.030 }, { ins: "Aceite de oliva", qty: 0.100 }, { ins: "Queso sardo", qty: 0.080 }] },
  { product: "Mediterránea",       lines: [{ ins: "Tomate", qty: 0.120 }, { ins: "Aceitunas negras", qty: 0.030 }, { ins: "Albahaca", qty: 0.100 }, { ins: "Aceite de oliva", qty: 0.020 }, { ins: "Alcaparras", qty: 0.025 }] },
  { product: "Parisien",           lines: [{ ins: "Jamón cocido", qty: 0.080 }, { ins: "Pechuga de pollo", qty: 0.130 }, { ins: "Salsa crema", qty: 2 }, { ins: "Champiñones", qty: 0.050 }, { ins: "Queso sardo", qty: 0.050 }] },
  { product: "Bagnacauda",         lines: [{ ins: "Ajo", qty: 0.200 }, { ins: "Salsa crema", qty: 2 }, { ins: "Anchoas en aceite", qty: 0.030 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Caruso",             lines: [{ ins: "Salsa crema", qty: 2 }, { ins: "Jamón cocido", qty: 0.080 }, { ins: "Champiñones", qty: 0.050 }, { ins: "Nueces", qty: 0.020 }] },
  { product: "Carbonara",          lines: [{ ins: "Panceta ahumada", qty: 0.080 }, { ins: "Cebolla", qty: 0.050 }, { ins: "Salsa crema", qty: 2 }, { ins: "Huevos", qty: 1 }, { ins: "Queso sardo", qty: 0.030 }] },
  { product: "Pomarola c/Langostinos", lines: [{ ins: "Salsa tuco", qty: 2 }, { ins: "Langostinos pelados", qty: 0.280 }, { ins: "Ajo", qty: 0.100 }, { ins: "Albahaca", qty: 0.050 }] },
  { product: "Gratén (salsa)",     lines: [{ ins: "Salsa crema", qty: 2 }, { ins: "Queso sardo", qty: 0.070 }, { ins: "Jamón cocido", qty: 0.120 }] },

  // ── Lomitos ──
  { product: "Lomito Simple",      lines: [{ ins: "Pan de lomo", qty: 1 }, { ins: "Lomo", qty: 0.120 }] },
  { product: "Lomito Jamón y Queso", lines: [{ ins: "Pan de lomo", qty: 1 }, { ins: "Lomo", qty: 0.120 }, { ins: "Queso barra", qty: 0.050 }, { ins: "Jamón cocido", qty: 0.040 }] },
  { product: "Lomito Especial",    lines: [{ ins: "Pan de lomo", qty: 1 }, { ins: "Lomo", qty: 0.120 }, { ins: "Queso barra", qty: 0.050 }, { ins: "Jamón cocido", qty: 0.040 }, { ins: "Lechuga", qty: 0.040 }, { ins: "Tomate", qty: 0.050 }] },
  { product: "Lomito Especial con Huevo", lines: [{ ins: "Pan de lomo", qty: 1 }, { ins: "Lomo", qty: 0.120 }, { ins: "Queso barra", qty: 0.050 }, { ins: "Jamón cocido", qty: 0.040 }, { ins: "Lechuga", qty: 0.040 }, { ins: "Tomate", qty: 0.050 }, { ins: "Huevos", qty: 1 }] },

  // ── Platos elaborados ──
  { product: "Lomo Reducción",     lines: [{ ins: "Lomo", qty: 0.350 }, { ins: "Panceta ahumada", qty: 0.025 }, { ins: "Salsa demiglasé", qty: 0.100 }, { ins: "Papa", qty: 0.200 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Entrecot Especial",  lines: [{ ins: "Entrecot", qty: 0.360 }, { ins: "Hongos de pino", qty: 0.075 }, { ins: "Salsa demiglasé", qty: 0.100 }, { ins: "Papa", qty: 0.200 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Solomillo Especial", lines: [{ ins: "Solomillo", qty: 0.290 }, { ins: "Aceto balsámico", qty: 0.100 }, { ins: "Papa", qty: 0.175 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Salsa demiglasé", qty: 0.100 }, { ins: "Puré de manzana", qty: 1 }] },
  { product: "Matambrito Pizza",   lines: [{ ins: "Matambre de cerdo", qty: 0.400 }, { ins: "Jamón cocido", qty: 0.120 }, { ins: "Salsa tuco", qty: 1 }, { ins: "Tomate", qty: 0.050 }, { ins: "Muzarella", qty: 0.080 }, { ins: "Papa", qty: 0.200 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Aceitunas negras", qty: 0.020 }, { ins: "Rúcula", qty: 0.030 }, { ins: "Queso sardo", qty: 0.050 }, { ins: "Orégano", qty: 0.005 }] },
  { product: "Matambrito Roquefort Nueces", lines: [{ ins: "Matambre de cerdo", qty: 0.400 }, { ins: "Salsa 4 quesos", qty: 1 }, { ins: "Papa", qty: 0.200 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Nueces", qty: 0.020 }] },
  { product: "Costillas Barbacoa", lines: [{ ins: "Costilla de cerdo", qty: 0.750 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Salsa barbacoa", qty: 50 }, { ins: "Papa", qty: 0.200 }] },
  { product: "Pollo Especial",     lines: [{ ins: "Pechuga de pollo", qty: 0.320 }, { ins: "Puerro", qty: 0.050 }, { ins: "Panceta ahumada", qty: 0.025 }, { ins: "Champiñones", qty: 0.040 }, { ins: "Papa", qty: 0.200 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Salteado Molleja Verdeo", lines: [{ ins: "Molleja", qty: 0.500 }, { ins: "Puerro", qty: 0.050 }, { ins: "Champiñones", qty: 0.050 }, { ins: "Papa", qty: 0.200 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Osobuco Braseado",   lines: [{ ins: "Osobuco", qty: 0.600 }, { ins: "Zanahoria", qty: 0.100 }, { ins: "Cebolla", qty: 0.100 }, { ins: "Vino tinto (cocina)", qty: 0.100 }, { ins: "Papa", qty: 0.200 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Petit Entrecot",     lines: [{ ins: "Entrecot", qty: 0.220 }, { ins: "Sal parrillera", qty: 0.001 }] },
  { product: "Empanada Carne",     lines: [{ ins: "Carne picada", qty: 0.024 }, { ins: "Cebolla", qty: 0.048 }, { ins: "Pimiento rojo", qty: 0.008 }, { ins: "Cebolla de verdeo", qty: 0.011 }, { ins: "Discos de empanada", qty: 1 }] },
  { product: "Empanada Jamón y Queso", lines: [{ ins: "Discos de empanada", qty: 1 }, { ins: "Jamón cocido", qty: 0.033 }, { ins: "Queso barra", qty: 0.050 }] },
  { product: "Espinaca Salteada",  lines: [{ ins: "Espinaca congelada", qty: 0.340 }, { ins: "Ajo", qty: 0.050 }, { ins: "Aceite de oliva", qty: 0.020 }, { ins: "Sal fina", qty: 0.001 }] },

  // ── Pescados elaborados ──
  { product: "Salmón Especial",    lines: [{ ins: "Filet de salmón", qty: 0.350 }, { ins: "Bocconcinos", qty: 0.150 }, { ins: "Tomate cherry", qty: 0.120 }, { ins: "Aceitunas negras", qty: 0.030 }, { ins: "Albahaca", qty: 0.080 }] },
  { product: "Salmón Crema Camarones", lines: [{ ins: "Filet de salmón", qty: 0.350 }, { ins: "Salsa crema", qty: 1 }, { ins: "Papa", qty: 0.200 }, { ins: "Langostinos pelados", qty: 0.090 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Salmón Crema Limón", lines: [{ ins: "Filet de salmón", qty: 0.350 }, { ins: "Salsa crema", qty: 1 }, { ins: "Limón", qty: 0.050 }, { ins: "Papa", qty: 0.200 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Calamaretes a la Leonesa", lines: [{ ins: "Calamaretes", qty: 0.300 }, { ins: "Vino blanco (cocina)", qty: 0.200 }, { ins: "Papa", qty: 0.200 }, { ins: "Cebolla", qty: 0.015 }, { ins: "Ajo", qty: 0.005 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Calamaretes Parmesano", lines: [{ ins: "Calamaretes", qty: 0.350 }, { ins: "Queso sardo", qty: 0.030 }, { ins: "Rúcula", qty: 0.060 }, { ins: "Aceite de girasol", qty: 0.020 }, { ins: "Sal fina", qty: 0.001 }] },
  { product: "Calamaretes Grillados", lines: [{ ins: "Calamaretes", qty: 0.350 }, { ins: "Rúcula", qty: 0.060 }, { ins: "Queso sardo", qty: 0.030 }, { ins: "Sal fina", qty: 0.001 }, { ins: "Aceite de oliva", qty: 0.012 }] },
  { product: "Arroz con Mariscos", lines: [{ ins: "Arroz", qty: 0.200 }, { ins: "Langostinos pelados", qty: 0.130 }, { ins: "Calamaretes", qty: 0.050 }, { ins: "Tubo de calamar", qty: 0.080 }, { ins: "Salsa tuco", qty: 1 }, { ins: "Sal fina", qty: 0.020 }] },

  // ── Postres ──
  { product: "Flan",               lines: [{ ins: "Huevos", qty: 3 }, { ins: "Azúcar", qty: 0.060 }, { ins: "Leche", qty: 0.300 }] },
  { product: "Mousse de Chocolate", lines: [{ ins: "Chocolate negro", qty: 0.125 }, { ins: "Huevos", qty: 3 }, { ins: "Azúcar", qty: 0.075 }, { ins: "Crema de leche", qty: 0.050 }] },
  { product: "Pera al Vino",       lines: [{ ins: "Pera", qty: 0.300 }, { ins: "Vino tinto (cocina)", qty: 0.125 }, { ins: "Azúcar", qty: 0.060 }] },
  { product: "Isla Flotante",      lines: [{ ins: "Leche", qty: 0.200 }, { ins: "Huevos", qty: 2 }, { ins: "Azúcar", qty: 0.053 }] },
  { product: "Cheesecake",         lines: [{ ins: "Queso crema", qty: 0.125 }, { ins: "Huevos", qty: 3 }, { ins: "Azúcar", qty: 0.075 }, { ins: "Crema de leche", qty: 0.075 }, { ins: "Vainillas", qty: 0.060 }] },
  { product: "Panqueques Dulce de Leche", lines: [{ ins: "Crepe", qty: 2 }, { ins: "Dulce de leche", qty: 0.080 }] },
  { product: "Frutillas c/Crema",  lines: [{ ins: "Frutillas", qty: 0.200 }, { ins: "Crema de leche", qty: 0.050 }] },
  { product: "Tortilla de Manzana", lines: [{ ins: "Manzana verde", qty: 0.400 }, { ins: "Huevos", qty: 3 }, { ins: "Harina 0000", qty: 0.080 }, { ins: "Azúcar", qty: 0.060 }] },
  { product: "Queso y Dulce",      lines: [{ ins: "Queso barra", qty: 0.120 }, { ins: "Dulce de leche", qty: 0.060 }] },
  { product: "Sambayón Batido",    lines: [{ ins: "Huevos", qty: 3 }, { ins: "Azúcar", qty: 0.060 }, { ins: "Vino blanco (cocina)", qty: 0.060 }] },

  // ── Sandwiches ──
  { product: "Tostado Mixto",      lines: [{ ins: "Pan de miga", qty: 2 }, { ins: "Queso barra", qty: 0.085 }, { ins: "Jamón cocido", qty: 0.090 }] },
  { product: "Tostado c/Tomate",   lines: [{ ins: "Pan de miga", qty: 2 }, { ins: "Queso barra", qty: 0.085 }, { ins: "Jamón cocido", qty: 0.090 }, { ins: "Tomate", qty: 0.100 }, { ins: "Huevos", qty: 1 }] },
];

// ═══════════════════════════════════════════════════════════════════
// 6. Validate
// ═══════════════════════════════════════════════════════════════════
const ingNames = new Set(CURATED.map(c => c[1]));
const missingIng = new Set();
for (const r of RECIPE_MAP) {
  for (const l of r.lines) {
    if (!ingNames.has(l.ins)) missingIng.add(l.ins);
  }
}
if (missingIng.size > 0) {
  console.error("WARNING: Recipe references ingredients not in CURATED:", [...missingIng]);
}

// ═══════════════════════════════════════════════════════════════════
// 7. Generate output file
// ═══════════════════════════════════════════════════════════════════
let out = "";
out += "// =================================================================\n";
out += "// EXTRACTED MAXIREST DATA FOR seed-data.ts\n";
out += "// Generated from: resguardo_mx_maxirest_20251223_10-03-34.sql\n";
out += `// Date: ${new Date().toISOString()}\n`;
out += "// =================================================================\n\n";

out += "// ─── SOURCE DATA STATS ──────────────────────────────────────────\n";
out += `// mxins: ${ingredients.size} ingredients in Maxirest DB\n`;
out += `// mxart: ${articles.size} articles in Maxirest DB\n`;
out += `// mxrec: ${recipeLines.length} recipe lines + ${subRecipeLines.length} sub-recipe lines\n`;
out += "//\n";
out += `// Curated ingredients: ${CURATED.length}\n`;
out += `// Recipes: ${RECIPE_MAP.length} products with recipe data\n`;
let totalLines = 0;
for (const r of RECIPE_MAP) totalLines += r.lines.length;
out += `// Total recipe lines: ${totalLines}\n`;
out += "// =================================================================\n\n";

// INGREDIENTS array
out += "export const INGREDIENTS: IngredientDef[] = [\n";
for (const [mxId, name, unit, waste, stock, minAlert, presentations] of CURATED) {
  out += `  {\n`;
  out += `    name: "${name}",\n`;
  out += `    unit: "${unit}",\n`;
  out += `    waste_percent: ${waste},\n`;
  out += `    stock_quantity: ${stock},\n`;
  out += `    stock_min_alert: ${minAlert === null ? "null" : minAlert},\n`;
  out += `    presentations: [\n`;
  for (let pi = 0; pi < presentations.length; pi++) {
    const p = presentations[pi];
    const cc = Math.round(p.cc);
    out += `      { name: "${p.name}", net_quantity: ${p.nq}, cost_cents: ${cc}, is_default: ${pi === 0} },\n`;
  }
  out += `    ],\n`;
  out += `  },\n`;
}
out += "];\n\n";

// RECIPES array
out += "export const RECIPES: RecipeDef[] = [\n";
for (const r of RECIPE_MAP) {
  out += `  {\n`;
  out += `    product_name: "${r.product}",\n`;
  out += `    lines: [\n`;
  for (const l of r.lines) {
    out += `      { ingredient_name: "${l.ins}", quantity: ${l.qty} },\n`;
  }
  out += `    ],\n`;
  out += `  },\n`;
}
out += "];\n";

const OUTPUT_PATH = "C:\\Users\\juanc\\Desktop\\GPSF\\Brain-Sistema-Restaurants\\code\\RestaurantOS\\scripts\\extracted-maxirest-data.txt";
writeFileSync(OUTPUT_PATH, out, "utf-8");

console.log(`\nOutput written to: ${OUTPUT_PATH}`);
console.log(`Ingredients: ${CURATED.length}`);
console.log(`Recipes: ${RECIPE_MAP.length} products`);
console.log(`Total recipe lines: ${totalLines}`);
if (missingIng.size > 0) {
  console.log("MISSING ingredients:", [...missingIng].join(", "));
} else {
  console.log("All ingredient references valid!");
}
