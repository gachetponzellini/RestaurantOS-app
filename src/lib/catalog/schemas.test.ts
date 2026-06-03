import { describe, expect, it } from "vitest";

import {
  ModifierGroupInput,
  ProductInput,
  warnGarnishModifierGroups,
} from "./schemas";

describe("ModifierGroupInput — Punto de cocción", () => {
  const puntoDeCoccion: ModifierGroupInput = {
    name: "Punto de cocción",
    min_selection: 1,
    max_selection: 1,
    is_required: true,
    sort_order: 0,
    modifiers: [
      { name: "Jugoso", price_delta_cents: 0, is_available: true, sort_order: 0 },
      { name: "A punto", price_delta_cents: 0, is_available: true, sort_order: 1 },
      { name: "Cocido", price_delta_cents: 0, is_available: true, sort_order: 2 },
    ],
  };

  it("acepta un grupo válido de punto de cocción", () => {
    const result = ModifierGroupInput.safeParse(puntoDeCoccion);
    expect(result.success).toBe(true);
  });

  it("es obligatorio y de selección única", () => {
    const result = ModifierGroupInput.safeParse(puntoDeCoccion);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_required).toBe(true);
      expect(result.data.min_selection).toBe(1);
      expect(result.data.max_selection).toBe(1);
    }
  });

  it("los 3 modificadores tienen price_delta_cents = 0", () => {
    const result = ModifierGroupInput.safeParse(puntoDeCoccion);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.modifiers).toHaveLength(3);
      for (const m of result.data.modifiers) {
        expect(m.price_delta_cents).toBe(0);
      }
    }
  });

  it("rechaza max_selection < min_selection", () => {
    const bad = { ...puntoDeCoccion, min_selection: 2, max_selection: 1 };
    const result = ModifierGroupInput.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("warnGarnishModifierGroups", () => {
  it('devuelve warning si un grupo se llama "Guarnición"', () => {
    const groups: ModifierGroupInput[] = [
      {
        name: "Guarnición",
        min_selection: 1,
        max_selection: 1,
        is_required: true,
        sort_order: 0,
        modifiers: [
          { name: "Papas fritas", price_delta_cents: 0, is_available: true, sort_order: 0 },
        ],
      },
    ];
    const warnings = warnGarnishModifierGroups(groups);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Guarnición");
  });

  it('devuelve warning si un grupo se llama "Guarniciones" (case-insensitive)', () => {
    const groups: ModifierGroupInput[] = [
      {
        name: "guarniciones",
        min_selection: 0,
        max_selection: 3,
        is_required: false,
        sort_order: 0,
        modifiers: [],
      },
    ];
    const warnings = warnGarnishModifierGroups(groups);
    expect(warnings).toHaveLength(1);
  });

  it("no genera warning para grupos normales", () => {
    const groups: ModifierGroupInput[] = [
      {
        name: "Punto de cocción",
        min_selection: 1,
        max_selection: 1,
        is_required: true,
        sort_order: 0,
        modifiers: [
          { name: "Jugoso", price_delta_cents: 0, is_available: true, sort_order: 0 },
        ],
      },
    ];
    const warnings = warnGarnishModifierGroups(groups);
    expect(warnings).toHaveLength(0);
  });
});
