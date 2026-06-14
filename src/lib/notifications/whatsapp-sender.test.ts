import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Credenciales que devuelve el "service client" mockeado. null = no conectado.
let credsRow: { api_key: string | null; from_phone: string | null } | null = null;

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: credsRow, error: null }) }),
      }),
    }),
  }),
}));

const { sendWhatsapp, isWhatsappConnected } = await import("./whatsapp-sender");

const SECRET = "D360-secret-key-xyz";

describe("sendWhatsapp", () => {
  beforeEach(() => {
    credsRow = { api_key: SECRET, from_phone: "5491100000000" };
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("negocio conectado → hace el POST y devuelve ok con el message id", async () => {
    const fetchMock = vi.fn(async () => ({
      status: 201,
      json: async () => ({ messages: [{ id: "wamid.OK1" }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendWhatsapp({
      businessId: "b1",
      to: "+5491122334455",
      text: "Hola",
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.messageId).toBe("wamid.OK1");
    expect(fetchMock).toHaveBeenCalledOnce();
    // La key viaja en el header D360-API-KEY, no en la URL ni el body.
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["D360-API-KEY"]).toBe(SECRET);
  });

  it("negocio sin credenciales → no llama a la red y devuelve 'no conectado'", async () => {
    credsRow = null;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendWhatsapp({ businessId: "b1", to: "x", text: "y" });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.toLowerCase()).toContain("no conectado");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("error del provider → ok:false saneado, sin filtrar la key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 400,
        json: async () => ({ error: { message: "Template not found" } }),
      })),
    );

    const res = await sendWhatsapp({
      businessId: "b1",
      to: "x",
      template: { name: "t", lang: "es_AR", params: [] },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Template not found");
      expect(res.error).not.toContain(SECRET);
    }
  });

  it("falla de red → ok:false sin tirar la operación", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    const res = await sendWhatsapp({ businessId: "b1", to: "x", text: "y" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).not.toContain(SECRET);
  });
});

describe("isWhatsappConnected", () => {
  afterEach(() => {
    credsRow = null;
  });
  it("true cuando hay api_key, false cuando no", async () => {
    credsRow = { api_key: SECRET, from_phone: "x" };
    expect(await isWhatsappConnected("b1")).toBe(true);
    credsRow = { api_key: null, from_phone: "x" };
    expect(await isWhatsappConnected("b1")).toBe(false);
    credsRow = null;
    expect(await isWhatsappConnected("b1")).toBe(false);
  });
});
