import { describe, it, expect } from "vitest";

import { resolveComboUpcharge, type ComboChoiceComponent } from "./combo-pricing";

const choice = (
  choice_group_id: string,
  product_id: string,
  extra_price_cents: number,
): ComboChoiceComponent => ({
  kind: "choice",
  choice_group_id,
  product_id,
  extra_price_cents,
});

describe("resolveComboUpcharge", () => {
  it("toma el adicional de la DB de cada opción elegida", () => {
    const components = [
      choice("bebida", "agua", 0),
      choice("bebida", "cerveza", 80000),
    ];
    const r = resolveComboUpcharge(components, [
      { choice_group_id: "bebida", product_id: "cerveza" },
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.deltaCents).toBe(80000);
      expect(r.choices).toEqual([
        { choice_group_id: "bebida", product_id: "cerveza", extra_price_cents: 80000 },
      ]);
    }
  });

  it("la opción base ($0) no cambia el precio", () => {
    const components = [
      choice("bebida", "agua", 0),
      choice("bebida", "cerveza", 80000),
    ];
    const r = resolveComboUpcharge(components, [
      { choice_group_id: "bebida", product_id: "agua" },
    ]);
    expect(r.ok && r.deltaCents).toBe(0);
  });

  it("ignora cualquier precio falseado en el payload — usa el de la DB", () => {
    const components = [choice("bebida", "cerveza", 80000)];
    // El payload manipulado intenta inflar el precio; la función sólo mira la DB.
    const r = resolveComboUpcharge(components, [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { choice_group_id: "bebida", product_id: "cerveza", extra_price_cents: 1 } as any,
    ]);
    expect(r.ok && r.deltaCents).toBe(80000);
  });

  it("rechaza una opción que no pertenece al grupo del menú", () => {
    const components = [choice("bebida", "agua", 0)];
    const r = resolveComboUpcharge(components, [
      { choice_group_id: "bebida", product_id: "whisky" },
    ]);
    expect(r.ok).toBe(false);
  });

  it("suma los adicionales de varios grupos", () => {
    const components = [
      choice("bebida", "cerveza", 80000),
      choice("postre", "flan", 50000),
      choice("postre", "fruta", 0),
    ];
    const r = resolveComboUpcharge(components, [
      { choice_group_id: "bebida", product_id: "cerveza" },
      { choice_group_id: "postre", product_id: "flan" },
    ]);
    expect(r.ok && r.deltaCents).toBe(130000);
  });

  it("sin opciones elegidas el delta es 0", () => {
    const components = [choice("bebida", "cerveza", 80000)];
    const r = resolveComboUpcharge(components, []);
    expect(r.ok && r.deltaCents).toBe(0);
  });
});
