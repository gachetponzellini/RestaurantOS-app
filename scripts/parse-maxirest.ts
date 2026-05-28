/**
 * parse-maxirest.ts
 *
 * Parses a Maxirest MySQL dump and extracts:
 *   - mxart  -> /tmp/mx_articles.json  (codigo, nombre)
 *   - mxins  -> /tmp/mx_insumos.json   (codigo, nombre, unidad_med, precio, stock_min, stock_max, desperdicio, envase1..precio3)
 *   - mxrec  -> /tmp/mx_recipes.json   (cod_art, cod_ins, cantidad, observac)  only cod_ins>0 && cantidad>0
 *
 * Usage:  npx tsx scripts/parse-maxirest.ts
 */

import * as fs from "fs";
import * as readline from "readline";
import * as path from "path";

const SQL_PATH = path.resolve(
  "C:/Users/juanc/Desktop/GPSF/Exp/MaxiRESTSQL/ResguardoBD/20251223_10-03-34",
  "resguardo_mx_maxirest_20251223_10-03-34.sql"
);

// INSERT patterns to search for (blob data in the dump causes line-number drift)
const INSERT_PATTERNS: Record<string, string> = {
  mxart: "INSERT INTO `mxart` VALUES ",
  mxins: "INSERT INTO `mxins` VALUES ",
  mxrec: "INSERT INTO `mxrec` VALUES ",
};

// ──────────────────────────────────────────────────
// State-machine parser: splits a MySQL VALUES line
// into an array of row arrays, handling quoted strings
// with backslash escaping and nested parens.
// ──────────────────────────────────────────────────

function parseInsertLine(line: string): string[][] {
  // Skip past "INSERT INTO `table` VALUES "
  const valuesIdx = line.indexOf("VALUES ");
  if (valuesIdx === -1) throw new Error("No VALUES keyword found in line");
  let pos = valuesIdx + "VALUES ".length;

  const rows: string[][] = [];
  const len = line.length;

  while (pos < len) {
    // skip whitespace/commas between row groups
    while (pos < len && (line[pos] === "," || line[pos] === " ")) pos++;
    if (pos >= len || line[pos] === ";") break;

    if (line[pos] !== "(") {
      throw new Error(`Expected '(' at pos ${pos}, got '${line[pos]}'`);
    }
    pos++; // skip opening (

    const values: string[] = [];
    let current = "";
    let inString = false;
    let depth = 0; // track nested parens (shouldn't happen, but safety)

    while (pos < len) {
      const ch = line[pos];

      if (inString) {
        if (ch === "\\" && pos + 1 < len) {
          // escaped char inside string
          current += ch + line[pos + 1];
          pos += 2;
          continue;
        }
        if (ch === "'") {
          // check for '' escape (two single quotes)
          if (pos + 1 < len && line[pos + 1] === "'") {
            current += "''";
            pos += 2;
            continue;
          }
          inString = false;
          current += ch;
          pos++;
          continue;
        }
        current += ch;
        pos++;
        continue;
      }

      // not in string
      if (ch === "'") {
        inString = true;
        current += ch;
        pos++;
        continue;
      }

      if (ch === "(") {
        depth++;
        current += ch;
        pos++;
        continue;
      }

      if (ch === ")") {
        if (depth > 0) {
          depth--;
          current += ch;
          pos++;
          continue;
        }
        // closing paren of this row
        values.push(current.trim());
        rows.push(values);
        pos++; // skip )
        break;
      }

      if (ch === "," && depth === 0) {
        values.push(current.trim());
        current = "";
        pos++;
        continue;
      }

      current += ch;
      pos++;
    }
  }

  return rows;
}

/** Strip surrounding single quotes and unescape */
function unquote(val: string): string {
  if (val.startsWith("'") && val.endsWith("'")) {
    return val
      .slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/''/g, "'")
      .replace(/\\0/g, "\0")
      .replace(/\\\\/g, "\\")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r");
  }
  return val;
}

function toNumber(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

// ──────────────────────────────────────────────────
// Column indices based on CREATE TABLE order (0-based)
// ──────────────────────────────────────────────────

// mxart: id(0) codigo(1) codid(2) nombre(3) ...
const MXART_CODIGO = 1;
const MXART_NOMBRE = 3;

// mxins: id(0) codigo(1) codid(2) nombre(3) cod_rui(4) unidad_med(5) precio(6)
//        precio_pro(7) stock_min(8) stock_max(9) dep_carga(10) envase1(11)
//        neto1(12) precio1(13) envase2(14) neto2(15) precio2(16) envase3(17)
//        neto3(18) precio3(19) porciones(20) modo_desc(21) cod_iva(22)
//        imp_int(23) receta(24) foto(25) desperdicio(26) ensegui(27) discont(28)
//        topecomp(29) eveventa(30) imp_int_porc(31) fotoblob(32)
const MXINS = {
  codigo: 1,
  nombre: 3,
  unidad_med: 5,
  precio: 6,
  stock_min: 8,
  stock_max: 9,
  envase1: 11,
  neto1: 12,
  precio1: 13,
  envase2: 14,
  neto2: 15,
  precio2: 16,
  envase3: 17,
  neto3: 18,
  precio3: 19,
  desperdicio: 26,
};

// mxrec: id(0) cod_art(1) cod_ins(2) cantidad(3) observac(4) bloq(5) cod_sec(6) fus_obl(7)
const MXREC = {
  cod_art: 1,
  cod_ins: 2,
  cantidad: 3,
  observac: 4,
};

// ──────────────────────────────────────────────────
// Read specific lines from the SQL file
// ──────────────────────────────────────────────────

async function findInsertLine(filePath: string, prefix: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { encoding: "latin1" });
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    let found = false;

    rl.on("line", (line) => {
      if (!found && line.startsWith(prefix)) {
        found = true;
        resolve(line);
        rl.close();
        stream.destroy();
      }
    });

    rl.on("close", () => {
      if (!found) {
        reject(new Error(`Pattern not found: ${prefix}`));
      }
    });

    rl.on("error", reject);
  });
}

// ──────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────

async function main() {
  console.log(`Reading SQL dump: ${SQL_PATH}`);
  console.log();

  // ── mxart ──
  console.log(`Searching for mxart INSERT...`);
  const artLine = await findInsertLine(SQL_PATH, INSERT_PATTERNS.mxart);
  console.log(`  Found (${artLine.length} chars). Parsing...`);
  const artRows = parseInsertLine(artLine);
  const articles = artRows.map((row) => ({
    codigo: toNumber(row[MXART_CODIGO]),
    nombre: unquote(row[MXART_NOMBRE]),
  }));
  fs.writeFileSync("C:/tmp/mx_articles.json", JSON.stringify(articles, null, 2), "utf-8");
  console.log(`  -> ${articles.length} articles -> /tmp/mx_articles.json`);

  // ── mxins ──
  console.log(`Searching for mxins INSERT...`);
  const insLine = await findInsertLine(SQL_PATH, INSERT_PATTERNS.mxins);
  console.log(`  Found (${insLine.length} chars). Parsing...`);
  const insRows = parseInsertLine(insLine);
  const insumos = insRows.map((row) => ({
    codigo: toNumber(row[MXINS.codigo]),
    nombre: unquote(row[MXINS.nombre]),
    unidad_med: unquote(row[MXINS.unidad_med]),
    precio: toNumber(row[MXINS.precio]),
    stock_min: toNumber(row[MXINS.stock_min]),
    stock_max: toNumber(row[MXINS.stock_max]),
    desperdicio: toNumber(row[MXINS.desperdicio]),
    envase1: unquote(row[MXINS.envase1]),
    neto1: toNumber(row[MXINS.neto1]),
    precio1: toNumber(row[MXINS.precio1]),
    envase2: unquote(row[MXINS.envase2]),
    neto2: toNumber(row[MXINS.neto2]),
    precio2: toNumber(row[MXINS.precio2]),
    envase3: unquote(row[MXINS.envase3]),
    neto3: toNumber(row[MXINS.neto3]),
    precio3: toNumber(row[MXINS.precio3]),
  }));
  fs.writeFileSync("C:/tmp/mx_insumos.json", JSON.stringify(insumos, null, 2), "utf-8");
  console.log(`  -> ${insumos.length} insumos -> /tmp/mx_insumos.json`);

  // ── mxrec ──
  console.log(`Searching for mxrec INSERT...`);
  const recLine = await findInsertLine(SQL_PATH, INSERT_PATTERNS.mxrec);
  console.log(`  Found (${recLine.length} chars). Parsing...`);
  const recRows = parseInsertLine(recLine);
  const allRecipes = recRows.map((row) => ({
    cod_art: toNumber(row[MXREC.cod_art]),
    cod_ins: toNumber(row[MXREC.cod_ins]),
    cantidad: toNumber(row[MXREC.cantidad]),
    observac: unquote(row[MXREC.observac]),
  }));
  const recipes = allRecipes.filter((r) => r.cod_ins > 0 && r.cantidad > 0);
  fs.writeFileSync("C:/tmp/mx_recipes.json", JSON.stringify(recipes, null, 2), "utf-8");
  console.log(`  -> ${allRecipes.length} total rows, ${recipes.length} filtered (cod_ins>0 AND cantidad>0) -> /tmp/mx_recipes.json`);

  // ── Summary ──
  console.log();
  console.log("=== Summary ===");
  console.log(`  Articles:  ${articles.length}`);
  console.log(`  Insumos:   ${insumos.length}`);
  console.log(`  Recipes:   ${recipes.length} (of ${allRecipes.length} total)`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
