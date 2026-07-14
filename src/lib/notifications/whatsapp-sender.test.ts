import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GUPSHUP_SESSION_URL,
  GUPSHUP_TEMPLATE_URL,
} from "./whatsapp-gupshup";

// Credenciales que devuelve el "service client" mockeado. null = no conectado.
let credsRow: {
  provider?: string | null;
  api_key: string | null;
  from_phone: string | null;
  app_name?: string | null;
} | null = null;

// Id de template que resuelve el mapa (mockeado). null = sin mapeo.
let gupshupTemplateId: string | null = "gs-uuid-xyz";

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: credsRow, error: null }) }),
      }),
    }),
  }),
}));

vi.mock("./template-map", () => ({
  resolveProviderTemplateId: async () => gupshupTemplateId,
}));

const { sendWhatsapp, isWhatsappConnected } = await import("./whatsapp-sender");

const SECRET = "D360-secret-key-xyz";

describe("sendWhatsapp · 360dialog (default)", () => {
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

describe("sendWhatsapp · gupshup (puente temporal)", () => {
  const GKEY = "gupshup-apikey-abc";
  beforeEach(() => {
    credsRow = {
      provider: "gupshup",
      api_key: GKEY,
      from_phone: "5491100000000",
      app_name: "GolfHouse",
    };
    gupshupTemplateId = "gs-uuid-xyz";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("texto → POST form-urlencoded al endpoint de sesión con header apikey", async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      json: async () => ({ status: "submitted", messageId: "gs1" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendWhatsapp({
      businessId: "b1",
      to: "+5491122334455",
      text: "Hola",
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.messageId).toBe("gs1");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GUPSHUP_SESSION_URL);
    expect((init.headers as Record<string, string>)["apikey"]).toBe(GKEY);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    // El cuerpo es form-urlencoded con el mensaje como JSON-string.
    expect(String(init.body)).toContain("channel=whatsapp");
    expect(String(init.body)).toContain("src.name=GolfHouse");
  });

  it("template con mapeo → POST al endpoint de template con el id del proveedor", async () => {
    const fetchMock = vi.fn(async () => ({
      status: 200,
      json: async () => ({ status: "submitted", messageId: "gs2" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendWhatsapp({
      businessId: "b1",
      to: "5491122334455",
      template: { name: "delivery_preparing", lang: "es_AR", params: ["Ana"] },
    });

    expect(res.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(GUPSHUP_TEMPLATE_URL);
    expect(decodeURIComponent(String(init.body))).toContain("gs-uuid-xyz");
  });

  it("template SIN mapeo → ok:false y no llama a la red (no envía a ciegas)", async () => {
    gupshupTemplateId = null;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendWhatsapp({
      businessId: "b1",
      to: "5491122334455",
      template: { name: "sin_mapa", lang: "es_AR", params: [] },
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.toLowerCase()).toContain("template");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falta app_name → ok:false y no llama a la red", async () => {
    credsRow = { provider: "gupshup", api_key: GKEY, from_phone: "549110", app_name: null };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendWhatsapp({ businessId: "b1", to: "x", text: "y" });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.toLowerCase()).toContain("gupshup");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("error del provider → ok:false saneado, sin filtrar la key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 401,
        json: async () => ({ status: "error", message: "Authentication Failed" }),
      })),
    );
    const res = await sendWhatsapp({ businessId: "b1", to: "x", text: "y" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain("Authentication Failed");
      expect(res.error).not.toContain(GKEY);
    }
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
