import { describe, expect, it } from "vitest";

import {
  DESCUENTO_BAJO_PCT,
  DESCUENTO_MEDIO_PCT,
  DIFERENCIA_CAJA_OK_CENTS,
  canAcceptCajaDifference,
  canApplyDiscount,
  canCancelItem,
  canHacerCorte,
  canMakeSangria,
  canManageCajas,
  canMarkRotura,
  canModifyPostEnvio,
  canRendirMozo,
} from "./can";

describe("permissions / canModifyPostEnvio", () => {
  it("admin y encargado pueden, mozo no", () => {
    expect(canModifyPostEnvio("admin")).toBe(true);
    expect(canModifyPostEnvio("encargado")).toBe(true);
    expect(canModifyPostEnvio("mozo")).toBe(false);
  });
});

describe("permissions / canCancelItem", () => {
  it("admin y encargado pueden, mozo no", () => {
    expect(canCancelItem("admin")).toBe(true);
    expect(canCancelItem("encargado")).toBe(true);
    expect(canCancelItem("mozo")).toBe(false);
  });
});

describe("permissions / canMarkRotura", () => {
  it("admin y encargado pueden, mozo no", () => {
    expect(canMarkRotura("admin")).toBe(true);
    expect(canMarkRotura("encargado")).toBe(true);
    expect(canMarkRotura("mozo")).toBe(false);
  });
});

describe("permissions / canApplyDiscount", () => {
  it("admin acepta cualquier porcentaje no negativo", () => {
    expect(canApplyDiscount("admin", 0)).toBe(true);
    expect(canApplyDiscount("admin", 25)).toBe(true);
    expect(canApplyDiscount("admin", 99)).toBe(true);
  });

  it("admin rechaza descuentos negativos", () => {
    expect(canApplyDiscount("admin", -1)).toBe(false);
  });

  it("encargado de caja: borde exacto en 25% acepta", () => {
    expect(canApplyDiscount("encargado", DESCUENTO_MEDIO_PCT)).toBe(true);
    expect(canApplyDiscount("encargado", 24.99)).toBe(true);
  });

  it("encargado de caja: por encima de 25% rechaza", () => {
    expect(canApplyDiscount("encargado", 25.0001)).toBe(false);
    expect(canApplyDiscount("encargado", 30)).toBe(false);
    expect(canApplyDiscount("encargado", 100)).toBe(false);
  });

  it("mozo: borde exacto en 10% acepta", () => {
    expect(canApplyDiscount("mozo", DESCUENTO_BAJO_PCT)).toBe(true);
    expect(canApplyDiscount("mozo", 9.99)).toBe(true);
    expect(canApplyDiscount("mozo", 0)).toBe(true);
  });

  it("mozo: por encima de 10% rechaza", () => {
    expect(canApplyDiscount("mozo", 10.0001)).toBe(false);
    expect(canApplyDiscount("mozo", 11)).toBe(false);
    expect(canApplyDiscount("mozo", 25)).toBe(false);
  });
});

describe("permissions / canManageCajas", () => {
  it("solo admin puede", () => {
    expect(canManageCajas("admin")).toBe(true);
    expect(canManageCajas("encargado")).toBe(false);
    expect(canManageCajas("mozo")).toBe(false);
  });
});

describe("permissions / canHacerCorte", () => {
  it("admin y encargado pueden, mozo no", () => {
    expect(canHacerCorte("admin")).toBe(true);
    expect(canHacerCorte("encargado")).toBe(true);
    expect(canHacerCorte("mozo")).toBe(false);
  });
});

describe("permissions / canAcceptCajaDifference", () => {
  it("admin acepta cualquier diferencia", () => {
    expect(canAcceptCajaDifference("admin", 0)).toBe(true);
    expect(canAcceptCajaDifference("admin", 100_000_000)).toBe(true);
    expect(canAcceptCajaDifference("admin", -100_000_000)).toBe(true);
  });

  it("encargado: borde exacto en $5000 (positivo) acepta", () => {
    expect(canAcceptCajaDifference("encargado", DIFERENCIA_CAJA_OK_CENTS))
      .toBe(true);
  });

  it("encargado: borde exacto en -$5000 (faltante) acepta", () => {
    expect(canAcceptCajaDifference("encargado", -DIFERENCIA_CAJA_OK_CENTS))
      .toBe(true);
  });

  it("encargado: $5000.01 rechaza (sobrante)", () => {
    expect(canAcceptCajaDifference("encargado", DIFERENCIA_CAJA_OK_CENTS + 1))
      .toBe(false);
  });

  it("encargado: -$5000.01 rechaza (faltante)", () => {
    expect(
      canAcceptCajaDifference(
        "encargado",
        -(DIFERENCIA_CAJA_OK_CENTS + 1),
      ),
    ).toBe(false);
  });

  it("mozo siempre rechaza", () => {
    expect(canAcceptCajaDifference("mozo", 0)).toBe(false);
    expect(canAcceptCajaDifference("mozo", 1000)).toBe(false);
  });
});

describe("permissions / canMakeSangria", () => {
  it("admin y encargado pueden, mozo no", () => {
    expect(canMakeSangria("admin")).toBe(true);
    expect(canMakeSangria("encargado")).toBe(true);
    expect(canMakeSangria("mozo")).toBe(false);
  });
});

describe("permissions / canRendirMozo", () => {
  it("admin y encargado pueden, mozo no", () => {
    expect(canRendirMozo("admin")).toBe(true);
    expect(canRendirMozo("encargado")).toBe(true);
    expect(canRendirMozo("mozo")).toBe(false);
  });
});
