import { describe, expect, it } from "vitest";

import { computeMermaReport, type MermaConsumptionRow } from "./merma";

function row(partial: Partial<MermaConsumptionRow>): MermaConsumptionRow {
  return {
    ingredientId: "ing-1",
    ingredientName: "Entrecote",
    ingredientUnit: "kg",
    wastePercent: 12,
    kind: "compra",
    quantity: 0,
    ...partial,
  };
}

describe("computeMermaReport", () => {
  it("cruza entró vs salió y estima merma según waste_percent", () => {
    // Escenario de la spec: entrecote waste 12%, compró 50kg, salió 44kg
    const rows: MermaConsumptionRow[] = [
      row({ kind: "compra", quantity: 30 }),
      row({ kind: "compra", quantity: 20 }),
      row({ kind: "venta", quantity: 40 }),
      row({ kind: "merma", quantity: 4 }),
    ];

    const [item] = computeMermaReport(rows);

    expect(item.enteredQty).toBe(50);
    expect(item.ventaQty).toBe(40);
    expect(item.mermaRegistradaQty).toBe(4);
    expect(item.exitedQty).toBe(44);
    // 50 × 12 / 100 = 6
    expect(item.mermaEstimadaQty).toBe(6);
    // 50 − 44 = 6
    expect(item.diffQty).toBe(6);
    expect(item.ingredientUnit).toBe("kg");
    expect(item.wastePercent).toBe(12);
  });

  it("ignora reversiones y ajustes (no son entrada ni salida)", () => {
    const rows: MermaConsumptionRow[] = [
      row({ kind: "compra", quantity: 10 }),
      row({ kind: "reversion", quantity: 3 }),
      row({ kind: "ajuste", quantity: 2 }),
      row({ kind: "venta", quantity: 5 }),
    ];

    const [item] = computeMermaReport(rows);

    expect(item.enteredQty).toBe(10);
    expect(item.exitedQty).toBe(5);
    expect(item.diffQty).toBe(5);
  });

  it("normaliza cantidades negativas con valor absoluto", () => {
    const rows: MermaConsumptionRow[] = [
      row({ kind: "venta", quantity: -8 }),
      row({ kind: "compra", quantity: 8 }),
    ];

    const [item] = computeMermaReport(rows);

    expect(item.ventaQty).toBe(8);
    expect(item.enteredQty).toBe(8);
  });

  it("agrupa por insumo y ordena por cantidad que entró (desc)", () => {
    const rows: MermaConsumptionRow[] = [
      row({ ingredientId: "a", ingredientName: "Harina", quantity: 5, kind: "compra" }),
      row({ ingredientId: "b", ingredientName: "Azúcar", quantity: 12, kind: "compra" }),
    ];

    const report = computeMermaReport(rows);

    expect(report).toHaveLength(2);
    expect(report[0].ingredientId).toBe("b");
    expect(report[1].ingredientId).toBe("a");
  });

  it("insumo sin compras: entró 0, merma estimada 0", () => {
    const rows: MermaConsumptionRow[] = [row({ kind: "venta", quantity: 7 })];

    const [item] = computeMermaReport(rows);

    expect(item.enteredQty).toBe(0);
    expect(item.mermaEstimadaQty).toBe(0);
    expect(item.exitedQty).toBe(7);
    expect(item.diffQty).toBe(-7);
  });
});
