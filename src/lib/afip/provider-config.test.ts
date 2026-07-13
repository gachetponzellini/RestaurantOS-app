import { describe, expect, it } from "vitest";

import {
  MISSING_CREDENTIALS_MESSAGE,
  hasRealCredentials,
  selectProvider,
} from "./provider-config";
import type { AFIPConfig, GatewayCredentials } from "./types";

const CREDS: GatewayCredentials = {
  apiKey: "sk_live_abc123",
  tenantSlug: "house",
  baseUrl: "https://arca-gpsf-gateway.vercel.app",
};

function config(overrides: Partial<AFIPConfig>): AFIPConfig {
  return {
    cuit: "20123456789",
    puntoVenta: 1,
    provider: "gateway",
    defaultTipo: "factura_b",
    mode: "sandbox",
    enabled: false,
    credentials: null,
    ...overrides,
  };
}

describe("afip/selectProvider", () => {
  it("modo sandbox → cliente sandbox", () => {
    expect(selectProvider(config({ mode: "sandbox" }))).toEqual({
      kind: "sandbox",
    });
  });

  it("producción pero no habilitada → sandbox", () => {
    const sel = selectProvider(
      config({ mode: "produccion", enabled: false, credentials: CREDS }),
    );
    expect(sel).toEqual({ kind: "sandbox" });
  });

  it("producción habilitada sin credencial → error, no llama al gateway", () => {
    const sel = selectProvider(
      config({ mode: "produccion", enabled: true, credentials: null }),
    );
    expect(sel).toEqual({ kind: "error", message: MISSING_CREDENTIALS_MESSAGE });
  });

  it("producción habilitada con credencial → gateway con esa credencial", () => {
    const sel = selectProvider(
      config({ mode: "produccion", enabled: true, credentials: CREDS }),
    );
    expect(sel).toEqual({ kind: "gateway", credentials: CREDS });
  });

  it("credencial incompleta en producción → error", () => {
    const sel = selectProvider(
      config({
        mode: "produccion",
        enabled: true,
        credentials: { apiKey: "sk_live_x", tenantSlug: "", baseUrl: "https://x" },
      }),
    );
    expect(sel.kind).toBe("error");
  });
});

describe("afip/hasRealCredentials", () => {
  it("true sólo con apiKey + tenantSlug + baseUrl", () => {
    expect(hasRealCredentials(CREDS)).toBe(true);
    expect(hasRealCredentials(null)).toBe(false);
    expect(
      hasRealCredentials({ apiKey: "sk", tenantSlug: "", baseUrl: "https://x" }),
    ).toBe(false);
  });
});
