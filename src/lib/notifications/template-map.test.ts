import { afterEach, describe, expect, it, vi } from "vitest";

// Fila que devuelve el "service client" mockeado (chainable .eq()).
let row: { provider_template_id: string } | null = null;

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => ({ data: row, error: null }),
      };
      return builder;
    },
  }),
}));

const { resolveProviderTemplateId } = await import("./template-map");

describe("resolveProviderTemplateId", () => {
  afterEach(() => {
    row = null;
  });

  it("devuelve el id del template cuando hay fila", async () => {
    row = { provider_template_id: "gs-uuid-123" };
    const id = await resolveProviderTemplateId(
      "b1",
      "gupshup",
      "delivery_preparing",
      "es_AR",
    );
    expect(id).toBe("gs-uuid-123");
  });

  it("devuelve null cuando no hay mapeo (no se envía a ciegas)", async () => {
    row = null;
    const id = await resolveProviderTemplateId("b1", "gupshup", "x", "es_AR");
    expect(id).toBeNull();
  });
});
