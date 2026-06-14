import { describe, expect, it } from "vitest";

import { classifyProviderError, isRetriable } from "./error-classification";

describe("afip/classifyProviderError", () => {
  it("HTTP 5xx y 503 son transitorios", () => {
    expect(classifyProviderError("Tusfacturas HTTP 503: Service Unavailable")).toBe(
      "transient",
    );
    expect(classifyProviderError("Tusfacturas HTTP 500")).toBe("transient");
    expect(classifyProviderError("HTTP 504 Gateway Timeout")).toBe("transient");
  });

  it("timeouts y errores de red son transitorios", () => {
    expect(classifyProviderError("network error")).toBe("transient");
    expect(classifyProviderError("ECONNRESET")).toBe("transient");
    expect(classifyProviderError("fetch failed")).toBe("transient");
    expect(classifyProviderError("request timed out")).toBe("transient");
  });

  it("rechazos de datos de ARCA son fiscales", () => {
    expect(
      classifyProviderError("CUIT receptor inválido para factura A"),
    ).toBe("fiscal");
    expect(classifyProviderError("Comprobante rechazado por AFIP")).toBe(
      "fiscal",
    );
    expect(classifyProviderError("HTTP 400: datos inválidos")).toBe("fiscal");
  });

  it("sin error o desconocido devuelve unknown", () => {
    expect(classifyProviderError(null)).toBe("unknown");
    expect(classifyProviderError(undefined)).toBe("unknown");
    expect(classifyProviderError("")).toBe("unknown");
    expect(classifyProviderError("algo raro pasó")).toBe("unknown");
  });

  it("isRetriable: fiscal no, transitorio y unknown sí", () => {
    expect(isRetriable("Tusfacturas HTTP 503")).toBe(true);
    expect(isRetriable("CUIT inválido")).toBe(false);
    expect(isRetriable("algo raro")).toBe(true);
    expect(isRetriable(null)).toBe(true);
  });
});
