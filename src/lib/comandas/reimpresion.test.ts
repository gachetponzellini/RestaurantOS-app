import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessRole } from "@/lib/admin/context";

// `solicitarReimpresion` (spec 35): gate encargado/admin + scope por business,
// setea `reprint_requested_at` y limpia `print_failed_at`. Mockeamos las
// dependencias de borde (tenant, auth de la action, service client, cache) para
// probar la lógica sin DB.

let currentRole: BusinessRole;
let commandaRow: { id: string; orders: { business_id: string } } | null;
let captured: { updates: Record<string, unknown>[] };

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/tenant", () => ({
  getBusiness: async (slug: string) =>
    slug === "nope" ? null : { id: "biz1", slug },
}));

vi.mock("@/lib/mozo/auth", () => ({
  requireMozoActionContext: async () => ({
    ok: true as const,
    data: { userId: "u1", role: currentRole, isPlatformAdmin: false },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: commandaRow }),
        }),
      }),
      update: (vals: Record<string, unknown>) => ({
        eq: () => {
          captured.updates.push(vals);
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));

// Server client (usado por otras actions del módulo al importarlas) — stub mínimo.
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  }),
}));

const { solicitarReimpresion } = await import("./actions");

beforeEach(() => {
  currentRole = "encargado";
  commandaRow = { id: "c1", orders: { business_id: "biz1" } };
  captured = { updates: [] };
});

describe("solicitarReimpresion (spec 35)", () => {
  it("encargado → setea reprint_requested_at y limpia print_failed_at (R3.1)", async () => {
    const res = await solicitarReimpresion("house", "c1");
    expect(res.ok).toBe(true);
    expect(captured.updates).toHaveLength(1);
    expect(captured.updates[0]).toHaveProperty("reprint_requested_at");
    expect(captured.updates[0].reprint_requested_at).toBeTruthy();
    expect(captured.updates[0]).toMatchObject({ print_failed_at: null });
  });

  it("admin → permitido", async () => {
    currentRole = "admin";
    const res = await solicitarReimpresion("house", "c1");
    expect(res.ok).toBe(true);
  });

  it("mozo → rechazado, no actualiza (R5.1)", async () => {
    currentRole = "mozo";
    const res = await solicitarReimpresion("house", "c1");
    expect(res.ok).toBe(false);
    expect(captured.updates).toHaveLength(0);
  });

  it("comanda de otro negocio → rechazada por scope (R5.2)", async () => {
    commandaRow = { id: "c1", orders: { business_id: "OTRO" } };
    const res = await solicitarReimpresion("house", "c1");
    expect(res.ok).toBe(false);
    expect(captured.updates).toHaveLength(0);
  });

  it("comanda inexistente → error", async () => {
    commandaRow = null;
    const res = await solicitarReimpresion("house", "c1");
    expect(res.ok).toBe(false);
    expect(captured.updates).toHaveLength(0);
  });
});
