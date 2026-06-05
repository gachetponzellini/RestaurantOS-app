import { describe, expect, it } from "vitest";

import { calcularRendicionMozo } from "./liquidacion-mozo";

describe("calcularRendicionMozo", () => {
  it("efectivo + tickets, sin contar propina", () => {
    const result = calcularRendicionMozo([
      { method: "cash", amount_cents: 1_150_000, tip_cents: 150_000 },
      { method: "cash", amount_cents: 500_000, tip_cents: 0 },
      { method: "card_manual", amount_cents: 2_000_000, tip_cents: 0 },
      { method: "transfer", amount_cents: 800_000, tip_cents: 0 },
    ]);

    expect(result.efectivo_cents).toBe(1_500_000);
    expect(result.tickets_cents).toBe(2_800_000);
    expect(result.total_propinas_cents).toBe(150_000);
    expect(result.por_metodo.cash).toBe(1_500_000);
    expect(result.por_metodo.card_manual).toBe(2_000_000);
    expect(result.por_metodo.transfer).toBe(800_000);
  });

  it("mozo sin pagos en el período → todo en cero", () => {
    const result = calcularRendicionMozo([]);

    expect(result.efectivo_cents).toBe(0);
    expect(result.tickets_cents).toBe(0);
    expect(result.total_propinas_cents).toBe(0);
    expect(result.por_metodo.cash).toBe(0);
    expect(result.por_metodo.card_manual).toBe(0);
  });

  it("solo tarjeta y transferencia → efectivo cero, tickets suma", () => {
    const result = calcularRendicionMozo([
      { method: "card_manual", amount_cents: 500_000, tip_cents: 0 },
      { method: "mp_qr", amount_cents: 300_000, tip_cents: 0 },
      { method: "transfer", amount_cents: 200_000, tip_cents: 0 },
    ]);

    expect(result.efectivo_cents).toBe(0);
    expect(result.tickets_cents).toBe(1_000_000);
    expect(result.por_metodo.card_manual).toBe(500_000);
    expect(result.por_metodo.mp_qr).toBe(300_000);
    expect(result.por_metodo.transfer).toBe(200_000);
  });

  it("propina en múltiples pagos se excluye de todos los métodos", () => {
    const result = calcularRendicionMozo([
      { method: "cash", amount_cents: 600_000, tip_cents: 100_000 },
      { method: "card_manual", amount_cents: 1_200_000, tip_cents: 200_000 },
    ]);

    expect(result.efectivo_cents).toBe(500_000);
    expect(result.tickets_cents).toBe(1_000_000);
    expect(result.total_propinas_cents).toBe(300_000);
    expect(result.por_metodo.cash).toBe(500_000);
    expect(result.por_metodo.card_manual).toBe(1_000_000);
  });

  it("solo efectivo sin propina", () => {
    const result = calcularRendicionMozo([
      { method: "cash", amount_cents: 300_000, tip_cents: 0 },
      { method: "cash", amount_cents: 700_000, tip_cents: 0 },
    ]);

    expect(result.efectivo_cents).toBe(1_000_000);
    expect(result.tickets_cents).toBe(0);
    expect(result.total_propinas_cents).toBe(0);
  });
});
