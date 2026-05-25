// ============================================
// Cálculos puros de cuenta + prorrateo de splits (CU-03 R1, R5, R6, R7).
//
// Funciones puras, sin I/O — testeables con casos límite (redondeo, dividir
// entre primos, etc).
// ============================================

import type { CuentaItem, CuentaTotals } from "./types";

export function calculateTotals(input: {
  subtotal_cents: number;
  tip_cents: number;
  discount_cents: number;
}): CuentaTotals {
  const subtotal = input.subtotal_cents;
  const tip = input.tip_cents;
  const discount = input.discount_cents;
  const total = Math.max(0, subtotal - discount + tip);
  return {
    subtotal_cents: subtotal,
    tip_cents: tip,
    discount_cents: discount,
    total_cents: total,
  };
}

export function sumActiveItems(items: CuentaItem[]): number {
  return items
    .filter((it) => it.cancelled_at === null)
    .reduce((acc, it) => acc + it.subtotal_cents, 0);
}

/**
 * Prorratea `total_cents` en `count` partes iguales con redondeo de centavos.
 * Devuelve un array de longitud `count`. La diferencia por redondeo va al
 * primer split (R7 de CU-03: "$33.33 / $33.33 / $33.34" cuando dividís
 * $100.00 en 3).
 *
 * Pre: count >= 1.
 */
export function prorrateEqualSplits(total_cents: number, count: number): number[] {
  if (count < 1) return [];
  if (count === 1) return [total_cents];
  const base = Math.floor(total_cents / count);
  const remainder = total_cents - base * count;
  const out = new Array<number>(count).fill(base);
  out[0] += remainder;
  return out;
}

/**
 * Agrupa items activos por seat_number. null = sin asignar.
 */
export function groupItemsBySeat(items: CuentaItem[]): Map<number | null, CuentaItem[]> {
  const map = new Map<number | null, CuentaItem[]>();
  for (const it of items) {
    if (it.cancelled_at !== null) continue;
    const key = it.seat_number ?? null;
    const bucket = map.get(key) ?? [];
    bucket.push(it);
    map.set(key, bucket);
  }
  return map;
}

/**
 * Dividir por items: dado un mapping {split_index → orderItemIds}, calcula
 * el `expected_amount_cents` para cada split.
 *
 * Aplica propina y descuento prorrateando proporcional al subtotal de cada
 * split (R5 de CU-03). Si subtotal global = 0 (todos cancelados), prorratea
 * por igual.
 *
 * Por R6, cada `order_item` debería estar en exactamente 1 split — eso lo
 * valida la action al construir el mapping. Esta función solo hace los
 * números, asumiendo el mapping bien formado.
 */
export function expectedBySplitItems(input: {
  items: CuentaItem[];
  mapping: Map<number, string[]>;
  tip_cents: number;
  discount_cents: number;
}): Array<{ split_index: number; expected_amount_cents: number }> {
  const itemById = new Map(input.items.map((it) => [it.id, it]));

  // Subtotal por split.
  const subtotalsByIndex = new Map<number, number>();
  let subtotalGlobal = 0;
  for (const [idx, ids] of input.mapping.entries()) {
    let sub = 0;
    for (const id of ids) {
      const it = itemById.get(id);
      if (!it || it.cancelled_at !== null) continue;
      sub += it.subtotal_cents;
    }
    subtotalsByIndex.set(idx, sub);
    subtotalGlobal += sub;
  }

  const indices = Array.from(input.mapping.keys()).sort((a, b) => a - b);
  const out: Array<{ split_index: number; expected_amount_cents: number }> = [];

  if (subtotalGlobal === 0) {
    // Edge case: todos los splits con subtotal 0. Prorrateamos
    // tip-discount por igual (en la práctica UI no permite confirmar un
    // mapping así, pero el helper es robusto).
    const adj = input.tip_cents - input.discount_cents;
    const equal = prorrateEqualSplits(Math.max(0, adj), indices.length);
    indices.forEach((idx, i) => {
      out.push({ split_index: idx, expected_amount_cents: equal[i] });
    });
    return out;
  }

  // Prorrateo proporcional con redondeo de centavos: el último split
  // absorbe el residuo para que la suma cierre exacta al total.
  const tipsRaw: number[] = [];
  const discountsRaw: number[] = [];
  let acumTip = 0;
  let acumDisc = 0;
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    const sub = subtotalsByIndex.get(idx) ?? 0;
    if (i === indices.length - 1) {
      tipsRaw.push(input.tip_cents - acumTip);
      discountsRaw.push(input.discount_cents - acumDisc);
    } else {
      const t = Math.round((sub * input.tip_cents) / subtotalGlobal);
      const d = Math.round((sub * input.discount_cents) / subtotalGlobal);
      tipsRaw.push(t);
      discountsRaw.push(d);
      acumTip += t;
      acumDisc += d;
    }
  }

  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    const sub = subtotalsByIndex.get(idx) ?? 0;
    const expected = Math.max(0, sub + tipsRaw[i] - discountsRaw[i]);
    out.push({ split_index: idx, expected_amount_cents: expected });
  }
  return out;
}
