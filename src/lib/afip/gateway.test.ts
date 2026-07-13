import { afterEach, describe, expect, it, vi } from "vitest";

import { createGatewayClient } from "./gateway";
import type { GatewayCredentials, InvoiceRequest } from "./types";

const CREDS: GatewayCredentials = {
  apiKey: "sk_live_test",
  tenantSlug: "house",
  baseUrl: "https://gw.test",
};

const REQ: InvoiceRequest = {
  tipo: "factura_b",
  puntoVenta: 1,
  cuitEmisor: "20123456789",
  totalCents: 12_100,
  concepto: "productos",
};

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("gateway.enqueue", () => {
  it("202 → pending con job_id, manda Bearer + Idempotency-Key + body mapeado", async () => {
    const fetchMock = mockFetch(202, { job_id: "job_1", status: "pending" });
    vi.stubGlobal("fetch", fetchMock);

    const client = createGatewayClient(CREDS);
    const res = await client.enqueue(REQ, "ros-order-42");

    expect(res).toMatchObject({ success: true, state: "pending", jobId: "job_1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gw.test/api/t/house/v1/invoices");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer sk_live_test");
    expect(init.headers["Idempotency-Key"]).toBe("ros-order-42");
    const sent = JSON.parse(init.body);
    expect(sent.tipo_comprobante).toBe(6);
    expect(sent.importe_total).toBe(121);
  });

  it("400 validación → failed con errorType validation", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(400, {
        error: { code: "invalid_payload", message: "receptor.doc_nro: Required", type: "validation" },
      }),
    );
    const res = await createGatewayClient(CREDS).enqueue(REQ, "k");
    expect(res.success).toBe(false);
    expect(res.state).toBe("failed");
    expect(res.errorType).toBe("validation");
    expect(res.error).toMatch(/doc_nro/);
  });

  it("error de red → failed transitorio (arca_down), reintentar con misma key es seguro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")));
    const res = await createGatewayClient(CREDS).enqueue(REQ, "k");
    expect(res).toMatchObject({ success: false, state: "failed", errorType: "arca_down" });
  });
});

describe("gateway.getStatus", () => {
  it("emitted → authorized con cae, cae_vto, numero y qr", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        status: "emitted",
        cae: "75123456789012",
        cae_vto: "2026-07-17",
        nro_comprobante: 43,
        qr_url: "https://www.afip.gob.ar/fe/qr/?p=abc",
      }),
    );
    const res = await createGatewayClient(CREDS).getStatus("job_1");
    expect(res).toMatchObject({
      success: true,
      state: "authorized",
      cae: "75123456789012",
      caeVencimiento: "2026-07-17",
      numero: 43,
      qrUrl: "https://www.afip.gob.ar/fe/qr/?p=abc",
    });
  });

  it("error → failed con detalle", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(200, {
        status: "error",
        error_type: "validation",
        error_detail: "El campo es inválido",
      }),
    );
    const res = await createGatewayClient(CREDS).getStatus("job_1");
    expect(res).toMatchObject({ success: false, state: "failed", errorType: "validation" });
    expect(res.error).toMatch(/inválido/);
  });

  it("pending/retrying → sigue pending", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { status: "retrying", attempts: 2 }));
    const res = await createGatewayClient(CREDS).getStatus("job_1");
    expect(res.state).toBe("pending");
  });

  it("error de red consultando → pending (no terminal, se sigue polleando)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const res = await createGatewayClient(CREDS).getStatus("job_1");
    expect(res.state).toBe("pending");
  });

  it("404 → failed (job inexistente, terminal)", async () => {
    vi.stubGlobal("fetch", mockFetch(404, { error: { message: "not found" } }));
    const res = await createGatewayClient(CREDS).getStatus("job_x");
    expect(res).toMatchObject({ success: false, state: "failed", errorType: "not_found" });
  });
});
