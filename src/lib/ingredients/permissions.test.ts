import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessRole } from "@/lib/admin/context";

// Spec 36 · bloque A (R-A1, R-A2): las mutaciones de recetas/insumos/stock-cocina
// usan el service client (bypassa RLS), así que el gate de permisos/tenant es la
// única barrera. Verificamos que exijan admin/encargado y no crucen tenant.

let currentAuth:
  | { ok: true; data: { userId: string; role: BusinessRole; isPlatformAdmin: boolean } }
  | { ok: false; error: string };

// Filas por tabla que devuelve el service client mockeado.
let tables: Record<string, unknown>;
// Escrituras capturadas (insert/update/delete) para asegurar "no escribe si rechaza".
let captured: { table: string; op: string; vals?: unknown }[];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/mozo/auth", () => ({
  requireMozoActionContext: async () => currentAuth,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  }),
}));

function makeBuilder(table: string) {
  const row = tables[table] ?? null;
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    gte: () => builder,
    lte: () => builder,
    range: () => builder,
    in: () => builder,
    maybeSingle: async () => ({ data: row }),
    single: async () => ({ data: row, error: null }),
    insert: (vals: unknown) => {
      captured.push({ table, op: "insert", vals });
      return builder;
    },
    update: (vals: unknown) => {
      captured.push({ table, op: "update", vals });
      return builder;
    },
    delete: () => {
      captured.push({ table, op: "delete" });
      return builder;
    },
    then: (resolve: (v: unknown) => unknown) =>
      resolve({ data: row, error: null, count: 0 }),
  };
  return builder;
}

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({ from: (table: string) => makeBuilder(table) }),
}));

const { saveRecipe, fetchPresentations } = await import("./actions");

beforeEach(() => {
  currentAuth = { ok: true, data: { userId: "u1", role: "admin", isPlatformAdmin: false } };
  tables = {
    businesses: { id: "biz1" },
    products: { id: "p1", business_id: "biz1" },
    ingredients: { business_id: "biz1" },
    ingredient_presentations: [{ id: "pres1", name: "Caja", net_quantity: 1, cost_cents: 100, is_default: true }],
  };
  captured = [];
});

describe("saveRecipe — gate de permisos (R-A1)", () => {
  it("admin sobre producto del negocio → permitido, escribe", async () => {
    const res = await saveRecipe("house", "p1", []);
    expect(res.ok).toBe(true);
    // borra las recipe lines viejas (reemplazo atómico)
    expect(captured.some((c) => c.table === "recipes" && c.op === "delete")).toBe(true);
  });

  it("mozo → rechazado, sin escritura (R-A1)", async () => {
    currentAuth = { ok: true, data: { userId: "u1", role: "mozo", isPlatformAdmin: false } };
    const res = await saveRecipe("house", "p1", []);
    expect(res.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it("sin sesión → rechazado, sin escritura", async () => {
    currentAuth = { ok: false, error: "Sesión expirada." };
    const res = await saveRecipe("house", "p1", []);
    expect(res.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });

  it("producto de otro negocio → rechazado por scope, sin escritura", async () => {
    tables.products = { id: "p1", business_id: "OTRO" };
    const res = await saveRecipe("house", "p1", []);
    expect(res.ok).toBe(false);
    expect(captured).toHaveLength(0);
  });
});

describe("fetchPresentations — IDOR de lectura (R-A2)", () => {
  it("miembro admin del negocio del ingrediente → devuelve datos", async () => {
    const data = await fetchPresentations("ing1");
    expect(data.length).toBe(1);
  });

  it("no-miembro (auth falla) → devuelve [] (no filtra costos ajenos)", async () => {
    currentAuth = { ok: false, error: "No tenés acceso a este negocio." };
    const data = await fetchPresentations("ing1");
    expect(data).toEqual([]);
  });

  it("rol mozo → devuelve [] (los costos son admin/encargado)", async () => {
    currentAuth = { ok: true, data: { userId: "u1", role: "mozo", isPlatformAdmin: false } };
    const data = await fetchPresentations("ing1");
    expect(data).toEqual([]);
  });
});
