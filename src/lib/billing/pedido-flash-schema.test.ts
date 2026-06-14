import { describe, expect, it } from "vitest";

import { pedidoFlashSchema } from "./pedido-flash-schema";

describe("billing / pedidoFlashSchema", () => {
  it("acepta un concepto y un monto en centavos > 0", () => {
    const r = pedidoFlashSchema.safeParse({
      concepto: "Lunch torneo Banco Macro",
      montoCents: 25_000_000,
    });
    expect(r.success).toBe(true);
  });

  it("recorta espacios del concepto", () => {
    const r = pedidoFlashSchema.safeParse({
      concepto: "  Evento  ",
      montoCents: 1000,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.concepto).toBe("Evento");
  });

  it("rechaza monto 0", () => {
    const r = pedidoFlashSchema.safeParse({ concepto: "X", montoCents: 0 });
    expect(r.success).toBe(false);
  });

  it("rechaza monto negativo", () => {
    const r = pedidoFlashSchema.safeParse({ concepto: "X", montoCents: -100 });
    expect(r.success).toBe(false);
  });

  it("rechaza monto no entero (no centavos)", () => {
    const r = pedidoFlashSchema.safeParse({ concepto: "X", montoCents: 10.5 });
    expect(r.success).toBe(false);
  });

  it("rechaza concepto vacío", () => {
    const r = pedidoFlashSchema.safeParse({ concepto: "", montoCents: 1000 });
    expect(r.success).toBe(false);
  });

  it("rechaza concepto sólo espacios", () => {
    const r = pedidoFlashSchema.safeParse({ concepto: "   ", montoCents: 1000 });
    expect(r.success).toBe(false);
  });
});
