import { beforeEach, describe, expect, it, vi } from "vitest";

// verifyAgentKey (spec 046) autentica SOLO con la key POR NEGOCIO de
// print_agent_credentials. La key global se retiró (security review #4).
// Mockeamos el lookup por-negocio.

let perBusinessKey: Record<string, string | null>;

vi.mock("@/lib/print-agent/credentials", () => ({
  getPrintAgentKey: async (businessId: string) =>
    perBusinessKey[businessId] ?? null,
}));

const { verifyAgentKey } = await import("./agent-auth");

function req(auth?: string) {
  return new Request("http://localhost/api/print-agent", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  process.env.PRINT_AGENT_KEY = "global-key";
  perBusinessKey = { bizA: "pak_live_AAA", bizB: "pak_live_BBB" };
});

describe("verifyAgentKey (spec 046)", () => {
  it("la key global RETIRADA ya no autentica (security review #4)", async () => {
    // Aunque PRINT_AGENT_KEY esté seteada en el env, se ignora: solo por-negocio.
    expect(await verifyAgentKey(req("Bearer global-key"), "bizA")).toBe(false);
  });

  it("acepta la key por-negocio correcta", async () => {
    expect(await verifyAgentKey(req("Bearer pak_live_AAA"), "bizA")).toBe(true);
  });

  it("rechaza la key de un negocio usada contra OTRO negocio", async () => {
    expect(await verifyAgentKey(req("Bearer pak_live_AAA"), "bizB")).toBe(false);
  });

  it("sin header Bearer → false", async () => {
    expect(await verifyAgentKey(req(), "bizA")).toBe(false);
    expect(await verifyAgentKey(req("global-key"), "bizA")).toBe(false);
  });

  it("token inválido sin businessId → false", async () => {
    expect(await verifyAgentKey(req("Bearer nope"))).toBe(false);
  });

  it("key por-negocio sin businessId → false (no puede validar contra la tabla)", async () => {
    expect(await verifyAgentKey(req("Bearer pak_live_AAA"))).toBe(false);
  });

  it("negocio sin key cargada → false", async () => {
    perBusinessKey = { bizA: null };
    expect(await verifyAgentKey(req("Bearer pak_live_AAA"), "bizA")).toBe(false);
  });

  it("comparación de distinta longitud → false, sin throw (timing-safe)", async () => {
    expect(await verifyAgentKey(req("Bearer short"), "bizA")).toBe(false);
  });

  it("sin key global seteada, sólo valida por negocio", async () => {
    delete process.env.PRINT_AGENT_KEY;
    expect(await verifyAgentKey(req("Bearer pak_live_AAA"), "bizA")).toBe(true);
    expect(await verifyAgentKey(req("Bearer global-key"), "bizA")).toBe(false);
  });
});
