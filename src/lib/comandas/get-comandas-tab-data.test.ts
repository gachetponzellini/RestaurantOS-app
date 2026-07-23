import { beforeEach, describe, expect, it, vi } from "vitest";

// Spec 052 — `getComandasTabData` (refetch de la tab Comandas del KDS). Foco:
// el GATE de membresía. Es crítico porque una de las 4 queries del refetch,
// `getMozosByBusiness`, corre con service-role (RLS bypass): sin el gate, un
// autenticado ajeno al negocio podría leer la nómina del staff pasando un slug
// foráneo. Mockeamos los bordes para no tocar la DB.

let gateOk: boolean;

vi.mock("@/lib/tenant", () => ({
  getBusiness: async (slug: string) =>
    slug === "nope" ? null : { id: "biz1", slug, timezone: "America/Argentina/Buenos_Aires" },
}));

vi.mock("@/lib/mozo/auth", () => ({
  requireMozoActionContext: async () =>
    gateOk
      ? { ok: true as const, data: { userId: "u1", role: "encargado", isPlatformAdmin: false } }
      : { ok: false as const, error: "No tenés acceso a este negocio." },
}));

const getMozosByBusiness = vi.fn(async (_id: string) => [
  { user_id: "u1", full_name: "Ana", role: "mozo" as const },
]);
vi.mock("@/lib/mozo/queries", () => ({
  getMozosByBusiness: (id: string) => getMozosByBusiness(id),
}));

const getActiveComandas = vi.fn(async () => [{ id: "c1" }]);
const getStationsForLocal = vi.fn(async () => [{ id: "s1", name: "Cocina", sort_order: 0 }]);
const getPrintAgentHealth = vi.fn(async () => ({ lastSeenAt: "2026-07-20T12:00:00Z" }));
vi.mock("@/lib/admin/local-query", () => ({
  getActiveComandas: () => getActiveComandas(),
  getStationsForLocal: () => getStationsForLocal(),
  getPrintAgentHealth: () => getPrintAgentHealth(),
}));

// No usado por getComandasTabData tras el gate, pero otras actions del módulo lo
// importan al cargar el archivo.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({}),
}));

import { getComandasTabData } from "./actions";

beforeEach(() => {
  gateOk = true;
  vi.clearAllMocks();
});

describe("getComandasTabData", () => {
  it("negocio inexistente → error, sin tocar queries", async () => {
    const res = await getComandasTabData("nope");
    expect(res.ok).toBe(false);
    expect(getMozosByBusiness).not.toHaveBeenCalled();
    expect(getActiveComandas).not.toHaveBeenCalled();
  });

  it("no-miembro → error y NO se lee la nómina (sin fuga cross-tenant)", async () => {
    gateOk = false;
    const res = await getComandasTabData("golf");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/acceso/i);
    // La clave del hallazgo de seguridad: la query service-role no corre.
    expect(getMozosByBusiness).not.toHaveBeenCalled();
    expect(getActiveComandas).not.toHaveBeenCalled();
    expect(getStationsForLocal).not.toHaveBeenCalled();
    expect(getPrintAgentHealth).not.toHaveBeenCalled();
  });

  it("miembro → devuelve las 4 partes de la tab", async () => {
    const res = await getComandasTabData("golf");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.comandas).toEqual([{ id: "c1" }]);
      expect(res.data.stations).toHaveLength(1);
      expect(res.data.mozos).toHaveLength(1);
      expect(res.data.printAgentLastSeenAt).toBe("2026-07-20T12:00:00Z");
    }
    expect(getMozosByBusiness).toHaveBeenCalledWith("biz1");
  });
});
