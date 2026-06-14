import { describe, expect, it } from "vitest";

import {
  MISSING_CREDENTIALS_MESSAGE,
  hasRealCredentials,
  selectProvider,
} from "./provider-config";
import type { AFIPConfig, TusfacturasCredentials } from "./types";

const CREDS: TusfacturasCredentials = {
  apiToken: "tok-abc",
  apiKey: "1134",
  userToken: "usr-xyz",
};

function config(overrides: Partial<AFIPConfig>): AFIPConfig {
  return {
    cuit: "20123456789",
    puntoVenta: 1,
    provider: "tusfacturas",
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

  it("producción habilitada sin credenciales → error, no llama al provider", () => {
    const sel = selectProvider(
      config({ mode: "produccion", enabled: true, credentials: null }),
    );
    expect(sel).toEqual({ kind: "error", message: MISSING_CREDENTIALS_MESSAGE });
  });

  it("producción habilitada con credenciales → tusfacturas con esas credenciales", () => {
    const sel = selectProvider(
      config({ mode: "produccion", enabled: true, credentials: CREDS }),
    );
    expect(sel).toEqual({ kind: "tusfacturas", credentials: CREDS });
  });

  it("credenciales incompletas en producción → error", () => {
    const sel = selectProvider(
      config({
        mode: "produccion",
        enabled: true,
        credentials: { apiToken: "x", apiKey: "", userToken: "z" },
      }),
    );
    expect(sel.kind).toBe("error");
  });
});

describe("afip/hasRealCredentials", () => {
  it("true sólo con los tres tokens", () => {
    expect(hasRealCredentials(CREDS)).toBe(true);
    expect(hasRealCredentials(null)).toBe(false);
    expect(
      hasRealCredentials({ apiToken: "x", apiKey: "", userToken: "z" }),
    ).toBe(false);
  });
});
