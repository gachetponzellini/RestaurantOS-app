import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Fakes configurables: service client de Supabase + next/headers ──────
// Cubren el enforcement de origen de `clockPunch` (spec 11) sin DB ni red.

type Member = { user_id: string; full_name: string | null; disabled_at: null };

let currentXff: string | null = null;

let captured: {
  blocked: Record<string, unknown>[];
  entries: Record<string, unknown>[];
};

function makeFakeService(opts: {
  origins?: { cidr: string }[];
  member?: Member | null;
  openEntry?: { id: string; clock_in: string } | null;
}) {
  captured = { blocked: [], entries: [] };
  const origins = opts.origins ?? [];
  const member = opts.member ?? null;
  const openEntry = opts.openEntry ?? null;

  function builder(table: string) {
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      is: () => b,
      order: () => b,
      in: () => b,
      maybeSingle: () => {
        if (table === "businesses")
          return Promise.resolve({ data: { id: "biz1" }, error: null });
        if (table === "business_users")
          return Promise.resolve({ data: member, error: null });
        if (table === "clock_entries")
          return Promise.resolve({ data: openEntry, error: null });
        return Promise.resolve({ data: null, error: null });
      },
      single: () =>
        Promise.resolve({
          data: { clock_in: "2026-06-14T12:00:00.000Z" },
          error: null,
        }),
      // Awaitable directo (clock_allowed_origins: select().eq()).
      then: (resolve: (v: { data: unknown; error: null }) => void) =>
        resolve({
          data: table === "clock_allowed_origins" ? origins : [],
          error: null,
        }),
      insert: (row: Record<string, unknown>) => {
        if (table === "clock_blocked_attempts") {
          captured.blocked.push(row);
          return Promise.resolve({ error: null });
        }
        if (table === "clock_entries") {
          captured.entries.push(row);
          return b; // sigue con .select().single()
        }
        return Promise.resolve({ error: null });
      },
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    };
    return b;
  }

  return { from: builder };
}

let currentClient = makeFakeService({});

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => currentClient,
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (k: string) => (k === "x-forwarded-for" ? currentXff : null),
  }),
}));

const { clockPunch } = await import("./clock-actions");

const MEMBER: Member = {
  user_id: "u1",
  full_name: "Ana",
  disabled_at: null,
};

describe("clockPunch — enforcement de origen (spec 11)", () => {
  beforeEach(() => {
    currentXff = null;
  });

  it("PIN mal formado → error sin tocar la DB", async () => {
    currentClient = makeFakeService({});
    const r = await clockPunch("house", "12");
    expect(r.ok).toBe(false);
    expect(captured.entries).toHaveLength(0);
  });

  it("allowlist vacía → sin enforcement, ficha entrada (back-compat)", async () => {
    currentClient = makeFakeService({ origins: [], member: MEMBER, openEntry: null });
    currentXff = "200.51.23.7"; // IP pública, pero no hay allowlist
    const r = await clockPunch("house", "1234");
    expect(r.ok).toBe(true);
    expect(captured.entries).toHaveLength(1);
    expect(captured.blocked).toHaveLength(0);
  });

  it("origen dentro del CIDR → ficha entrada", async () => {
    currentClient = makeFakeService({
      origins: [{ cidr: "192.168.10.0/24" }],
      member: MEMBER,
      openEntry: null,
    });
    currentXff = "192.168.10.42";
    const r = await clockPunch("house", "1234");
    expect(r.ok).toBe(true);
    expect(captured.entries).toHaveLength(1);
    expect(captured.blocked).toHaveLength(0);
  });

  it("origen fuera del CIDR → rechaza, no crea clock_entry y loguea el intento", async () => {
    currentClient = makeFakeService({
      origins: [{ cidr: "192.168.10.0/24" }],
      member: MEMBER,
      openEntry: null,
    });
    currentXff = "200.51.23.7"; // celular fuera de la red
    const r = await clockPunch("house", "1234");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/computadoras del local/i);
    expect(captured.entries).toHaveLength(0);
    expect(captured.blocked).toHaveLength(1);
    // PIN enmascarado, nunca en claro.
    expect(captured.blocked[0].pin_masked).toBe("1**4");
    expect(captured.blocked[0].pin_masked).not.toBe("1234");
  });

  it("sin x-forwarded-for y con allowlist → rechaza (no se puede verificar origen)", async () => {
    currentClient = makeFakeService({
      origins: [{ cidr: "192.168.10.0/24" }],
      member: MEMBER,
      openEntry: null,
    });
    currentXff = null;
    const r = await clockPunch("house", "1234");
    expect(r.ok).toBe(false);
    expect(captured.blocked).toHaveLength(1);
    expect(captured.blocked[0].ip).toBe("unknown");
  });
});
