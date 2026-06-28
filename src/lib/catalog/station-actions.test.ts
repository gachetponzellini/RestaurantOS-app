import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessRole } from "@/lib/admin/context";

// ── Fakes: tenant, auth context y service client ────────────────────────
// Cubre el gate de permisos (canManageBusiness) + scope business_id de
// setStationPrinter. La validación de IP/puerto vive en schemas.test.ts.

let currentRole: BusinessRole | null = "admin";
let isPlatform = false;

let captured: {
  updates: { id: string; business_id: string; row: Record<string, unknown> }[];
};

function resetCaptured() {
  captured = { updates: [] };
}

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/tenant", () => ({
  getBusiness: async (slug: string) => ({ id: "biz1", slug }),
}));

vi.mock("@/lib/admin/context", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/admin/context")>();
  return {
    ...actual,
    ensureAdminAccess: async () => ({
      user: { id: "u1" },
      userEmail: "a@b.com",
      isPlatformAdmin: isPlatform,
      role: currentRole,
    }),
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({}),
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({
      update: (row: Record<string, unknown>) => {
        const eqState: { id?: string; business_id?: string } = {};
        const chain = {
          eq: (col: string, val: string) => {
            if (col === "id") eqState.id = val;
            if (col === "business_id") eqState.business_id = val;
            if (eqState.id && eqState.business_id) {
              captured.updates.push({
                id: eqState.id,
                business_id: eqState.business_id,
                row,
              });
              return Promise.resolve({ error: null });
            }
            return chain;
          },
        };
        return chain;
      },
    }),
  }),
}));

const { setStationPrinter } = await import("./station-actions");

describe("setStationPrinter", () => {
  beforeEach(() => {
    resetCaptured();
    currentRole = "admin";
    isPlatform = false;
  });

  it("admin con IP válida → update scopeado al sector y negocio", async () => {
    const r = await setStationPrinter("house", "st1", {
      printer_ip: "192.168.10.50",
      printer_port: 9100,
      printer_enabled: true,
    });
    expect(r.ok).toBe(true);
    expect(captured.updates).toHaveLength(1);
    expect(captured.updates[0]).toMatchObject({
      id: "st1",
      business_id: "biz1",
      row: {
        printer_ip: "192.168.10.50",
        printer_port: 9100,
        printer_enabled: true,
      },
    });
  });

  it("IP vacía → persiste printer_ip null (sector sin impresora)", async () => {
    const r = await setStationPrinter("house", "st1", {
      printer_ip: "   ",
      printer_port: 9100,
      printer_enabled: false,
    });
    expect(r.ok).toBe(true);
    expect(captured.updates[0]?.row).toMatchObject({
      printer_ip: null,
      printer_enabled: false,
    });
  });

  it("encargado → error de permiso, no actualiza", async () => {
    currentRole = "encargado";
    const r = await setStationPrinter("house", "st1", {
      printer_ip: "192.168.10.50",
      printer_port: 9100,
      printer_enabled: true,
    });
    expect(r.ok).toBe(false);
    expect(captured.updates).toHaveLength(0);
  });

  it("mozo → error de permiso, no actualiza", async () => {
    currentRole = "mozo";
    const r = await setStationPrinter("house", "st1", {
      printer_ip: "192.168.10.50",
      printer_port: 9100,
      printer_enabled: true,
    });
    expect(r.ok).toBe(false);
    expect(captured.updates).toHaveLength(0);
  });

  it("IP inválida → error, no actualiza", async () => {
    const r = await setStationPrinter("house", "st1", {
      printer_ip: "192.168.10.300",
      printer_port: 9100,
      printer_enabled: true,
    });
    expect(r.ok).toBe(false);
    expect(captured.updates).toHaveLength(0);
  });

  it("platform admin (role null) → permitido", async () => {
    currentRole = null;
    isPlatform = true;
    const r = await setStationPrinter("house", "st1", {
      printer_ip: "10.0.0.20",
      printer_port: 9100,
      printer_enabled: true,
    });
    expect(r.ok).toBe(true);
    expect(captured.updates).toHaveLength(1);
  });
});
