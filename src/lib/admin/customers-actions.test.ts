import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessRole } from "@/lib/admin/context";

// Spec 054 (fase 2) — `buscarClientes` + `getClienteDirecciones`: gate del staff
// + scope + early-return. Mockeamos tenant/auth/service para no tocar la DB.

let currentRole: BusinessRole;
let serviceRows: { id: string; name: string | null; phone: string }[];
let customerRow: { id: string } | null;
let addressRows: {
  id: string;
  label: string | null;
  street: string;
  number: string | null;
  apartment: string | null;
  notes: string | null;
}[];

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
    from: (table: string) => {
      // `order()` resuelve directo (getClienteDirecciones) pero también acepta
      // `.limit()` encadenado (buscarClientes) → devolvemos una promesa con
      // `.limit()` colgado.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        or: () => chain,
        maybeSingle: () =>
          Promise.resolve({ data: customerRow, error: null }),
        order: () =>
          Object.assign(
            Promise.resolve({
              data: table === "customer_addresses" ? addressRows : serviceRows,
              error: null,
            }),
            { limit: () => Promise.resolve({ data: serviceRows, error: null }) },
          ),
        limit: () => Promise.resolve({ data: serviceRows, error: null }),
      };
      return chain;
    },
  }),
}));

import { buscarClientes, getClienteDirecciones } from "./customers-actions";

beforeEach(() => {
  currentRole = "encargado";
  serviceRows = [
    { id: "c1", name: "Juan Pérez", phone: "1155551234" },
    { id: "c2", name: "Juana López", phone: "1166660000" },
  ];
  customerRow = { id: "c1" };
  addressRows = [
    {
      id: "a1",
      label: "Casa",
      street: "Av. Golf",
      number: "123",
      apartment: null,
      notes: null,
    },
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

describe("getClienteDirecciones", () => {
  it("el encargado obtiene las direcciones del cliente", async () => {
    const res = await getClienteDirecciones("golf", "c1");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toHaveLength(1);
  });

  it("rechaza un cliente que no pertenece al negocio (scope tenant)", async () => {
    customerRow = null;
    const res = await getClienteDirecciones("golf", "c1");
    expect(res.ok).toBe(false);
  });

  it("el mozo no puede traer direcciones (mismo gate)", async () => {
    currentRole = "mozo";
    const res = await getClienteDirecciones("golf", "c1");
    expect(res.ok).toBe(false);
  });
});
