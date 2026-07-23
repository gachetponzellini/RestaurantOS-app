import { describe, it, expect } from "vitest";

import { clampIndex, moveSelection, resetSelection } from "./product-search";

describe("clampIndex", () => {
  it("índice dentro de rango: lo devuelve igual", () => {
    expect(clampIndex(2, 5)).toBe(2);
  });

  it("índice por debajo de 0: lo sube a 0", () => {
    expect(clampIndex(-3, 5)).toBe(0);
  });

  it("índice por encima del último: lo baja a length-1", () => {
    expect(clampIndex(9, 5)).toBe(4);
  });

  it("lista vacía: -1 (sin selección posible)", () => {
    expect(clampIndex(0, 0)).toBe(-1);
  });

  it("lista de un elemento: siempre 0", () => {
    expect(clampIndex(0, 1)).toBe(0);
    expect(clampIndex(5, 1)).toBe(0);
  });
});

describe("moveSelection", () => {
  it("baja una posición (↓)", () => {
    expect(moveSelection(1, 1, 5)).toBe(2);
  });

  it("sube una posición (↑)", () => {
    expect(moveSelection(3, -1, 5)).toBe(2);
  });

  it("↓ en el último: se queda en el último (sin wrap)", () => {
    expect(moveSelection(4, 1, 5)).toBe(4);
  });

  it("↑ en el primero: se queda en el primero (sin wrap)", () => {
    expect(moveSelection(0, -1, 5)).toBe(0);
  });

  it("delta grande: clamp al borde", () => {
    expect(moveSelection(0, 10, 5)).toBe(4);
    expect(moveSelection(4, -10, 5)).toBe(0);
  });

  it("lista vacía: -1", () => {
    expect(moveSelection(0, 1, 0)).toBe(-1);
  });

  it("arrancando sin selección (-1), ↓ lleva al primero", () => {
    expect(moveSelection(-1, 1, 5)).toBe(0);
  });
});

describe("resetSelection", () => {
  it("con resultados: selecciona el primero (0)", () => {
    expect(resetSelection(3)).toBe(0);
  });

  it("sin resultados: -1", () => {
    expect(resetSelection(0)).toBe(-1);
  });
});
