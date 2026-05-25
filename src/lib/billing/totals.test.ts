import { describe, expect, it } from "vitest";

import {
  calculateTotals,
  expectedBySplitItems,
  prorrateEqualSplits,
  sumActiveItems,
} from "./totals";
import type { CuentaItem } from "./types";

const item = (id: string, sub: number, cancelled = false): CuentaItem => ({
  id,
  product_name: "x",
  quantity: 1,
  subtotal_cents: sub,
  notes: null,
  station_id: null,
  cancelled_at: cancelled ? new Date().toISOString() : null,
  loaded_by: null,
  seat_number: null,
});

describe("calculateTotals", () => {
  it("subtotal − discount + tip", () => {
    expect(
      calculateTotals({ subtotal_cents: 10_000, tip_cents: 1_500, discount_cents: 0 }),
    ).toEqual({ subtotal_cents: 10_000, tip_cents: 1_500, discount_cents: 0, total_cents: 11_500 });
  });

  it("clampea total a 0 si descuento > subtotal+tip", () => {
    expect(
      calculateTotals({ subtotal_cents: 1_000, tip_cents: 0, discount_cents: 5_000 }).total_cents,
    ).toBe(0);
  });
});

describe("sumActiveItems", () => {
  it("ignora cancelados", () => {
    expect(
      sumActiveItems([item("a", 1_000), item("b", 2_000), item("c", 500, true)]),
    ).toBe(3_000);
  });
});

describe("prorrateEqualSplits", () => {
  it("3 splits sobre $100.00 → 33.34 / 33.33 / 33.33", () => {
    expect(prorrateEqualSplits(10_000, 3)).toEqual([3_334, 3_333, 3_333]);
  });

  it("división exacta sin residuo", () => {
    expect(prorrateEqualSplits(10_000, 5)).toEqual([2_000, 2_000, 2_000, 2_000, 2_000]);
  });

  it("count=1 devuelve el total entero", () => {
    expect(prorrateEqualSplits(10_000, 1)).toEqual([10_000]);
  });
});

describe("expectedBySplitItems", () => {
  it("dos splits sin propina ni descuento: subtotal directo", () => {
    const items = [item("a", 5_000), item("b", 3_000)];
    const mapping = new Map<number, string[]>([
      [1, ["a"]],
      [2, ["b"]],
    ]);
    const result = expectedBySplitItems({
      items,
      mapping,
      tip_cents: 0,
      discount_cents: 0,
    });
    expect(result).toEqual([
      { split_index: 1, expected_amount_cents: 5_000 },
      { split_index: 2, expected_amount_cents: 3_000 },
    ]);
  });

  it("propina y descuento prorrateados; suma cierra al total", () => {
    const items = [item("a", 6_000), item("b", 4_000)];
    const mapping = new Map<number, string[]>([
      [1, ["a"]],
      [2, ["b"]],
    ]);
    const result = expectedBySplitItems({
      items,
      mapping,
      tip_cents: 1_000, // 600 → split1, 400 → split2
      discount_cents: 500, // 300 → split1, 200 → split2
    });
    const total = result.reduce((acc, r) => acc + r.expected_amount_cents, 0);
    expect(total).toBe(6_000 + 4_000 + 1_000 - 500); // 10_500
    expect(result[0].expected_amount_cents).toBe(6_000 + 600 - 300);
    expect(result[1].expected_amount_cents).toBe(4_000 + 400 - 200);
  });

  it("redondeo de centavos: el último split absorbe el residuo", () => {
    const items = [item("a", 3_333), item("b", 3_333), item("c", 3_334)];
    const mapping = new Map<number, string[]>([
      [1, ["a"]],
      [2, ["b"]],
      [3, ["c"]],
    ]);
    // tip 100, sin descuento. 100 / 10_000 prorrateado por subtotales muy
    // parejos → suma debe cerrar exacto a 100.
    const result = expectedBySplitItems({
      items,
      mapping,
      tip_cents: 100,
      discount_cents: 0,
    });
    const totalSubtotal = items.reduce((a, it) => a + it.subtotal_cents, 0);
    const totalExpected = result.reduce((a, r) => a + r.expected_amount_cents, 0);
    expect(totalExpected).toBe(totalSubtotal + 100);
  });

  it("ignora items cancelados al sumar", () => {
    const items = [item("a", 5_000), item("b", 3_000, true)];
    const mapping = new Map<number, string[]>([
      [1, ["a", "b"]],
    ]);
    const result = expectedBySplitItems({
      items,
      mapping,
      tip_cents: 0,
      discount_cents: 0,
    });
    expect(result[0].expected_amount_cents).toBe(5_000);
  });
});
