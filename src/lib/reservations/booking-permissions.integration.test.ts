// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbAvailable = Boolean(supabaseUrl && serviceKey);

const TEST_TAG = `test-resvperm-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// El usuario "logueado" lo controla este let: el mock de getUser lo lee por
// referencia, así que cada test lo reasigna al actor que quiere probar.
let CURRENT_USER_ID = "";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: CURRENT_USER_ID ? { id: CURRENT_USER_ID } : null },
        error: null,
      }),
    },
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const { createReservationFromAdmin } = await import("./booking-actions");

describe.skipIf(!dbAvailable)("reservas · permisos de gestión (spec 22)", () => {
  const supabase = createClient(supabaseUrl!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let businessId = "";
  let businessSlug = "";
  let mozoId = "";
  let personalId = "";

  const mkUser = async (suffix: string, fullName: string) => {
    const email = `${TEST_TAG}-${suffix}@example.test`;
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: "test-pass-12345",
      email_confirm: true,
    });
    if (error || !data?.user) throw new Error(`auth user ${suffix}: ${error?.message}`);
    await supabase.from("users").upsert({ id: data.user.id, email, full_name: fullName });
    return data.user.id;
  };

  const baseInput = () => ({
    business_slug: businessSlug,
    date: "2027-01-15",
    slot: "20:00",
    party_size: 2,
    customer_name: "Cliente Test",
    customer_phone: "+5491100000000",
  });

  beforeAll(async () => {
    mozoId = await mkUser("mozo", "Mozo Test");
    personalId = await mkUser("personal", "Personal Test");

    const { data: biz } = await supabase
      .from("businesses")
      .insert({
        slug: TEST_TAG,
        name: "Resv Perm Test",
        is_active: true,
        timezone: "America/Argentina/Buenos_Aires",
      })
      .select("id, slug")
      .single();
    businessId = biz!.id;
    businessSlug = biz!.slug;

    await supabase.from("business_users").insert([
      { business_id: businessId, user_id: mozoId, role: "mozo" },
      { business_id: businessId, user_id: personalId, role: "personal" },
    ]);

    const { data: fp } = await supabase
      .from("floor_plans")
      .insert({ business_id: businessId, name: "Salón" })
      .select("id")
      .single();
    await supabase.from("tables").insert({
      floor_plan_id: fp!.id,
      label: "1",
      seats: 4,
      shape: "circle",
      x: 0,
      y: 0,
      width: 80,
      height: 80,
    });
  });

  afterAll(async () => {
    if (businessId) await supabase.from("businesses").delete().eq("id", businessId);
    for (const id of [mozoId, personalId].filter(Boolean)) {
      await supabase.from("users").delete().eq("id", id);
      await supabase.auth.admin.deleteUser(id);
    }
  });

  it("mozo puede crear una reserva (cambio de spec 22)", async () => {
    CURRENT_USER_ID = mozoId;
    const result = await createReservationFromAdmin(baseInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      await supabase.from("reservations").delete().eq("id", result.data.id);
    }
  });

  it("personal NO puede crear una reserva", async () => {
    CURRENT_USER_ID = personalId;
    const result = await createReservationFromAdmin(baseInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/permiso/i);
  });

  it("sin sesión → no autenticado", async () => {
    CURRENT_USER_ID = "";
    const result = await createReservationFromAdmin(baseInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/autenticado/i);
  });
});
