import { describe, it, expect } from "vitest";

import { DailyMenuComponentInput } from "./schemas";

const baseChoice = {
  label: "Cerveza",
  kind: "choice" as const,
  product_id: "11111111-1111-4111-8111-111111111111",
  choice_group_id: "22222222-2222-4222-8222-222222222222",
};

describe("DailyMenuComponentInput · extra_price_cents", () => {
  it("acepta omitir el adicional (la columna DB aplica el default 0)", () => {
    const result = DailyMenuComponentInput.safeParse(baseChoice);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.extra_price_cents).toBeUndefined();
  });

  it("acepta un adicional positivo", () => {
    const parsed = DailyMenuComponentInput.parse({
      ...baseChoice,
      extra_price_cents: 80000,
    });
    expect(parsed.extra_price_cents).toBe(80000);
  });

  it("rechaza un adicional negativo", () => {
    const result = DailyMenuComponentInput.safeParse({
      ...baseChoice,
      extra_price_cents: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un adicional no entero", () => {
    const result = DailyMenuComponentInput.safeParse({
      ...baseChoice,
      extra_price_cents: 12.5,
    });
    expect(result.success).toBe(false);
  });
});
