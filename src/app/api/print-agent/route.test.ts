import { beforeEach, describe, expect, it, vi } from "vitest";

// El GET hace pull de comandas `pendiente` con su `printer_ip` por sector (spec
// 28). El POST confirma la impresión (`ok` → en_preparacion) o reporta un fallo
// (`failed` → setea print_failed_at + notifica, una sola vez — spec 33).
// Mockeamos el service client (query-builder + update) y `notifyPrintFailed`.

type Row = Record<string, unknown>;
let rows: Row[]; // filas del GET
let postRow: Row | null; // fila del select del POST (maybeSingle)
let captured: { updates: Record<string, unknown>[]; orFilters: string[] };
let notifyCalls: { businessId: string; comandaId: string }[];

vi.mock("@/lib/notifications/events", () => ({
  notifyPrintFailed: async (p: { businessId: string; comandaId: string }) => {
    notifyCalls.push(p);
  },
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({
      select: () => {
        const b = {
          eq: () => b,
          or: (filter: string) => {
            captured.orFilters.push(filter);
            return b;
          },
          order: () => b,
          maybeSingle: async () => ({ data: postRow }),
          then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
            resolve({ data: rows, error: null }),
        };
        return b;
      },
      update: (vals: Record<string, unknown>) => ({
        eq: () => {
          captured.updates.push(vals);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

const { GET, POST } = await import("./route");

function makeRow(name: string, printerIp: string | null): Row {
  return {
    id: `c-${name}`,
    station_id: `st-${name}`,
    batch: 1,
    status: "pendiente",
    emitted_at: "2026-01-01T00:00:00Z",
    stations: {
      name,
      printer_ip: printerIp,
      printer_port: 9100,
      printer_enabled: true,
    },
    orders: {
      id: "o1",
      business_id: "biz1",
      table_id: "t1",
      tables: { label: "Mesa 1" },
    },
    comanda_items: [],
  };
}

function getReq(auth = "Bearer test-key") {
  return new Request("http://localhost/api/print-agent?business_id=biz1", {
    headers: auth ? { authorization: auth } : {},
  });
}

function postReq(body: unknown, auth = "Bearer test-key") {
  return new Request("http://localhost/api/print-agent", {
    method: "POST",
    headers: auth
      ? { authorization: auth, "content-type": "application/json" }
      : { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.PRINT_AGENT_KEY = "test-key";
  rows = [makeRow("Cocina", "192.168.10.50"), makeRow("Bar", null)];
  postRow = null;
  captured = { updates: [], orFilters: [] };
  notifyCalls = [];
});

describe("GET /api/print-agent — printer_ip por comanda (spec 28)", () => {
  it("incluye printer_ip/printer_port del sector en cada comanda", async () => {
    const res = await GET(getReq());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      comandas: { station_name: string; printer_ip: string | null; printer_port: number }[];
    };
    const cocina = body.comandas.find((c) => c.station_name === "Cocina");
    expect(cocina?.printer_ip).toBe("192.168.10.50");
    expect(cocina?.printer_port).toBe(9100);
  });

  it("sector sin IP configurada → printer_ip null (no se pierde la comanda)", async () => {
    const res = await GET(getReq());
    const body = (await res.json()) as {
      comandas: { station_name: string; printer_ip: string | null }[];
    };
    const bar = body.comandas.find((c) => c.station_name === "Bar");
    expect(bar?.printer_ip).toBeNull();
  });

  it("incluye las comandas con reimpresión pedida, no solo las pendiente (spec 35)", async () => {
    // El filtro del GET debe ser `status=pendiente OR reprint_requested_at not null`
    // para que una comanda ya avanzada con reimpresión pedida llegue al agente.
    await GET(getReq());
    expect(captured.orFilters).toHaveLength(1);
    expect(captured.orFilters[0]).toContain("status.eq.pendiente");
    expect(captured.orFilters[0]).toContain("reprint_requested_at.not.is.null");
  });

  it("sin Bearer válido → 401", async () => {
    const res = await GET(getReq(""));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/print-agent — confirmación y reporte de fallo (spec 33)", () => {
  it("result:failed sin flag previo → setea print_failed_at, notifica, NO cambia estado", async () => {
    postRow = {
      id: "c1",
      status: "pendiente",
      print_failed_at: null,
      orders: { business_id: "biz1" },
    };
    const res = await POST(postReq({ comanda_id: "c1", result: "failed" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { notified: boolean };
    expect(body.notified).toBe(true);
    expect(notifyCalls).toEqual([{ businessId: "biz1", comandaId: "c1" }]);
    // setea print_failed_at, no toca status
    expect(captured.updates).toHaveLength(1);
    expect(captured.updates[0]).toHaveProperty("print_failed_at");
    expect(captured.updates[0]).not.toHaveProperty("status");
  });

  it("result:failed con flag ya seteado → dedup, NO re-notifica ni actualiza", async () => {
    postRow = {
      id: "c1",
      status: "pendiente",
      print_failed_at: "2026-01-01T00:00:00Z",
      orders: { business_id: "biz1" },
    };
    const res = await POST(postReq({ comanda_id: "c1", result: "failed" }));
    const body = (await res.json()) as { notified: boolean; alreadyFlagged: boolean };
    expect(body.notified).toBe(false);
    expect(body.alreadyFlagged).toBe(true);
    expect(notifyCalls).toHaveLength(0);
    expect(captured.updates).toHaveLength(0);
  });

  it("result:ok (default) → pendiente → en_preparacion + limpia los flags", async () => {
    postRow = {
      id: "c1",
      status: "pendiente",
      print_failed_at: null,
      reprint_requested_at: null,
      orders: { business_id: "biz1" },
    };
    const res = await POST(postReq({ comanda_id: "c1" }));
    const body = (await res.json()) as { status: string; changed: boolean };
    expect(body.status).toBe("en_preparacion");
    expect(body.changed).toBe(true);
    expect(captured.updates[0]).toMatchObject({
      status: "en_preparacion",
      print_failed_at: null,
      reprint_requested_at: null,
    });
    expect(notifyCalls).toHaveLength(0);
  });

  it("result:ok sobre una comanda `entregado` reimpresa → limpia reprint sin regresar estado (spec 35, R1.3)", async () => {
    postRow = {
      id: "c1",
      status: "entregado",
      print_failed_at: null,
      reprint_requested_at: "2026-07-06T00:00:00Z",
      orders: { business_id: "biz1" },
    };
    const res = await POST(postReq({ comanda_id: "c1" }));
    const body = (await res.json()) as { status: string; changed: boolean };
    // Sigue `entregado`, no vuelve a `en_preparacion`.
    expect(body.status).toBe("entregado");
    expect(body.changed).toBe(false);
    // Limpia el flag de reimpresión (y no toca el status).
    expect(captured.updates).toHaveLength(1);
    expect(captured.updates[0]).toMatchObject({ reprint_requested_at: null });
    expect(captured.updates[0]).not.toHaveProperty("status");
  });

  it("comanda inexistente → 404", async () => {
    postRow = null;
    const res = await POST(postReq({ comanda_id: "nope", result: "failed" }));
    expect(res.status).toBe(404);
  });

  it("sin Bearer válido → 401", async () => {
    const res = await POST(postReq({ comanda_id: "c1" }, ""));
    expect(res.status).toBe(401);
  });
});
