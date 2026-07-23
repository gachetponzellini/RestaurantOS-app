import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessRole } from "@/lib/admin/context";

// Spec 054 (fase 2) — `buscarClientes`: gate del staff + scope + early-return
// para términos cortos. Mockeamos tenant/auth/service para no tocar la DB.

let currentRole: BusinessRole;
let serviceRows: { id: string; name: string | null; phone: string }[];

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
    from: () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        or: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: serviceRows, error: null }),
      };
      return chain;
    },
  }),
}));

import { buscarClientes } from "./customers-actions";

beforeEach(() => {
  currentRole = "encargado";
  serviceRows = [
    { id: "c1", name: "Juan Pérez", phone: "1155551234" },
    { id: "c2", name: "Juana López", phone: "1166660000" },
  ];
});

describe("buscarClientes", () => {
  it("devuelve [] sin tocar nada para términos de menos de 2 caracteres", async () => {
    const res = await buscarClientes("golf", "j");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual([]);
  });

  it("el encargado obtiene los clientes que matchean", async () => {
    const res = await buscarClientes("golf", "jua");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toHaveLength(2);
  });

  it("el mozo no puede buscar clientes (fase 1, mismo gate que cargar)", async () => {
    currentRole = "mozo";
    const res = await buscarClientes("golf", "jua");
    expect(res.ok).toBe(false);
  });

  it("negocio inexistente → error", async () => {
    const res = await buscarClientes("nope", "jua");
    expect(res.ok).toBe(false);
  });
});
