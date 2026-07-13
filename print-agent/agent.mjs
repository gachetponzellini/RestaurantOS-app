// ─────────────────────────────────────────────────────────────────────────
// Print agent de referencia (spec 28). Loop: pull → imprimir → confirmar.
//
//   GET  /api/print-agent?business_id=…   (Bearer PRINT_AGENT_KEY)
//   por cada comanda `pendiente` → imprimir el ticket
//   POST /api/print-agent { comanda_id }  → pendiente → en_preparacion
//
// Dos transportes (config.transport):
//   "network" → socket TCP a printer_ip:printer_port con ESC/POS. Es el flujo
//               de PRODUCCIÓN on-site (comandera térmica de red). Usa la IP que
//               viene en cada comanda (spec 28) → cero mapeo local.
//   "windows" → imprime por el driver de Windows (Out-Printer) a config.printerName.
//               Para PROBAR con una impresora USB / no-térmica (ej. HP LaserJet).
//               En este modo la printer_ip de la comanda no se usa.
//
// Flags:
//   --once         una sola pasada (sin loop)
//   --dry-run      no imprime ni confirma; muestra el ticket en consola
//   --no-confirm   imprime pero NO hace el POST (no cambia el estado)
//   --limit=N      imprime como máximo N comandas en esta corrida
//
// Correr:  node print-agent/agent.mjs --once --dry-run
// ─────────────────────────────────────────────────────────────────────────

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, "config.json"), "utf8"));

const args = process.argv.slice(2);
const ONCE = args.includes("--once");
const DRY = args.includes("--dry-run");
const NO_CONFIRM = args.includes("--no-confirm");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? parseInt(limitArg.slice("--limit=".length), 10) : Infinity;

const base = String(cfg.serverUrl).replace(/\/$/, "");
const authHeaders = { authorization: `Bearer ${cfg.printAgentKey}` };

// Tras N fallos consecutivos de impresión de una comanda, se avisa al local
// (spec 33). El server deduplica igual (comandas.print_failed_at), pero el
// umbral evita avisar por un blip (≈ pollMs * FAIL_THRESHOLD de gracia).
const FAIL_THRESHOLD = 5;
const failCounts = new Map(); // comanda_id → fallos consecutivos

/** Arma el texto del ticket (monoespaciado, ~32 col). */
function ticketText(c) {
  const wide = "================================";
  const thin = "--------------------------------";
  const L = [];
  L.push(wide);
  L.push(`  ${String(c.station_name).toUpperCase()}`);
  L.push(`  ${c.table_label}    Tanda ${c.batch}`);
  L.push(`  Comanda #${String(c.comanda_id).slice(0, 8)}`);
  try {
    L.push(`  ${new Date(c.emitted_at).toLocaleString("es-AR")}`);
  } catch {
    /* fecha opcional */
  }
  L.push(thin);
  for (const it of c.items ?? []) {
    L.push(`${it.quantity}x  ${it.product_name}`);
    if (it.modifiers && it.modifiers.length)
      L.push(`      + ${it.modifiers.join(", ")}`);
    if (it.notes) L.push(`      obs: ${it.notes}`);
  }
  if (!c.items || c.items.length === 0) L.push("(sin items)");
  L.push(wide);
  L.push("");
  L.push("");
  return L.join("\r\n");
}

/** Imprime por el driver de Windows (GDI) a una impresora instalada. */
function printWindows(text, printerName) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(
      os.tmpdir(),
      `comanda-${Date.now()}-${Math.floor(Math.random() * 1e6)}.txt`,
    );
    fs.writeFileSync(tmp, text, "utf8");
    const safeName = String(printerName).replace(/'/g, "''");
    const cmd = `Get-Content -Encoding UTF8 -Path '${tmp}' | Out-Printer -Name '${safeName}'`;
    const ps = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", cmd],
      { windowsHide: true },
    );
    let err = "";
    ps.stderr.on("data", (d) => (err += d));
    ps.on("error", reject);
    ps.on("exit", (code) => {
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* best-effort */
      }
      code === 0
        ? resolve()
        : reject(new Error(`powershell exit ${code}: ${err.trim()}`));
    });
  });
}

/** Imprime en una térmica de red por socket TCP con ESC/POS (producción). */
function printNetwork(text, ip, port) {
  return new Promise((resolve, reject) => {
    const ESC = "\x1b";
    const GS = "\x1d";
    const payload = ESC + "@" + text + "\n\n\n" + GS + "V" + "\x00"; // init + texto + corte
    const socket = net.createConnection({ host: ip, port: port || 9100 }, () => {
      socket.write(Buffer.from(payload, "latin1"), () => socket.end());
    });
    socket.setTimeout(5000);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("timeout TCP"));
    });
    socket.on("error", reject);
    socket.on("close", () => resolve());
  });
}

async function fetchComandas() {
  const res = await fetch(
    `${base}/api/print-agent?business_id=${encodeURIComponent(cfg.businessId)}`,
    { headers: authHeaders },
  );
  if (!res.ok) throw new Error(`GET ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.comandas ?? [];
}

/**
 * Latido de salud (spec 35). Best-effort: si falla, no corta el loop — solo
 * significa que operación verá el agente como "sin conexión" hasta el próximo
 * latido OK. Un agente viejo (sin esta llamada) sigue imprimiendo igual.
 */
async function sendHeartbeat() {
  try {
    await fetch(`${base}/api/print-agent/heartbeat`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ business_id: cfg.businessId }),
    });
  } catch {
    /* best-effort: el próximo tick reintenta */
  }
}

/**
 * Reporta al server: `result:"ok"` confirma (→ en_preparacion) o
 * `result:"failed"` avisa el fallo de impresión (spec 33).
 */
async function report(comandaId, result, error) {
  const res = await fetch(`${base}/api/print-agent`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      comanda_id: comandaId,
      business_id: cfg.businessId,
      result,
      error,
    }),
  });
  return res.ok;
}

async function printOne(c) {
  const text = ticketText(c);
  if (DRY) {
    console.log("\n" + text);
    return;
  }
  if (c.printer_enabled === false) {
    console.log(`  ⏭  ${c.station_name}: comandera desactivada`);
    return;
  }

  // Intento de impresión. Si falla, NO se confirma → la comanda queda
  // `pendiente` y se reintenta; tras el umbral, se avisa al local (spec 33).
  try {
    if (cfg.transport === "network") {
      if (!c.printer_ip) {
        console.log(`  ⏭  ${c.station_name}: sin printer_ip, se saltea`);
        return;
      }
      await printNetwork(text, c.printer_ip, c.printer_port);
    } else {
      await printWindows(text, cfg.printerName);
    }
  } catch (e) {
    const n = (failCounts.get(c.comanda_id) ?? 0) + 1;
    failCounts.set(c.comanda_id, n);
    console.error(
      `  ✗ no imprimió #${String(c.comanda_id).slice(0, 8)} (${c.station_name}): ${e.message} [intento ${n}]`,
    );
    if (n === FAIL_THRESHOLD) {
      const ok = await report(c.comanda_id, "failed", e.message);
      console.error(
        `     ${ok ? "⚠ avisado al local (notificación de fallo)" : "✗ no se pudo avisar"}`,
      );
    }
    return;
  }

  // Imprimió OK: limpia el contador y confirma.
  failCounts.delete(c.comanda_id);
  console.log(
    `  🖨  impresa #${String(c.comanda_id).slice(0, 8)} · ${c.station_name} · ${c.table_label}`,
  );
  if (!NO_CONFIRM) {
    const ok = await report(c.comanda_id, "ok");
    console.log(
      `     ${ok ? "✓ confirmada (→ en_preparacion)" : "✗ no se pudo confirmar"}`,
    );
  }
}

async function tick() {
  // Latido de salud antes del pull (spec 35). No bloquea la impresión.
  if (!DRY) await sendHeartbeat();
  const comandas = await fetchComandas();
  const pend = comandas.length;
  if (pend === 0) {
    console.log("· sin comandas pendientes");
    return;
  }
  const toPrint = comandas.slice(0, LIMIT);
  console.log(
    `· ${pend} pendiente(s)${LIMIT < Infinity ? `, imprimo ${toPrint.length}` : ""}`,
  );
  for (const c of toPrint) {
    try {
      await printOne(c);
    } catch (e) {
      console.error(
        `  ✗ error imprimiendo ${String(c.comanda_id).slice(0, 8)}: ${e.message}`,
      );
    }
  }
}

console.log(
  `print-agent → ${base} · negocio ${String(cfg.businessId).slice(0, 8)} · transporte ${cfg.transport}` +
    (cfg.transport === "windows" ? ` (${cfg.printerName})` : ""),
);
if (DRY) console.log("modo DRY-RUN: no imprime ni confirma\n");

if (ONCE) {
  try {
    await tick();
  } catch (e) {
    console.error(`✗ ${e.message}`);
    process.exitCode = 1;
  }
  // Salida natural: NO usar process.exit(). Forzar el exit con los sockets del
  // fetch todavía cerrándose crashea libuv en Windows (Assertion async.c:94).
  // Al terminar el top-level, el loop de eventos drena solo y el proceso cierra.
} else {
  console.log(`loop cada ${cfg.pollMs}ms — Ctrl+C para cortar\n`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      await tick();
    } catch (e) {
      console.error(`✗ ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, cfg.pollMs));
  }
}
