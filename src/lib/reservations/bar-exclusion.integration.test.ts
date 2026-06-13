// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbAvailable = Boolean(supabaseUrl && serviceKey);

const TEST_TAG = `test-barexcl-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// `server-only` y el server client no cargan en node puro — los stubeamos.
// getBusinessTables con `useService: true` usa el service client (real).
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({}),
}));

const { getBusinessTables } = await import("./queries");

describe.skipIf(!dbAvailable)("getBusinessTables · excludeBar (spec 08)", () => {
  const supabase = createClient(supabaseUrl!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let businessId: string;
  let floorPlanId: string;
  let normalTableId: string;
  let barTableId: string;

  beforeAll(async () => {
    const { data: biz } = await supabase
      .from("businesses")
      .insert({ slug: TEST_TAG, name: "Bar Excl Test", is_active: true })
      .select("id")
      .single();
    businessId = biz!.id;

    const { data: fp } = await supabase
      .from("floor_plans")
      .insert({ business_id: businessId, name: "Salón" })
      .select("id")
      .single();
    floorPlanId = fp!.id;

    const mkTable = async (label: string, isBar: boolean) => {
      const { data } = await supabase
        .from("tables")
        .insert({
          floor_plan_id: floorPlanId,
          label,
          seats: 4,
          shape: "circle",
          x: 0,
          y: 0,
          width: 80,
          height: 80,
          is_bar: isBar,
        })
        .select("id")
        .single();
      return data!.id as string;
    };
    normalTableId = await mkTable("1", false);
    barTableId = await mkTable("BAR", true);
  });

  afterAll(async () => {
    if (businessId) await supabase.from("businesses").delete().eq("id", businessId);
  });

  it(
    "excludeBar: true → la barra queda fuera (motor de reservas)",
    { timeout: 30_000 },
    async () => {
      const tables = await getBusinessTables(businessId, {
        useService: true,
        floorPlanId,
        excludeBar: true,
      });
      const ids = tables.map((t) => t.id);
      expect(ids).toContain(normalTableId);
      expect(ids).not.toContain(barTableId);
    },
  );

  it(
    "sin excludeBar → la barra sí aparece (operación de salón/mozo)",
    { timeout: 30_000 },
    async () => {
      const tables = await getBusinessTables(businessId, {
        useService: true,
        floorPlanId,
      });
      const ids = tables.map((t) => t.id);
      expect(ids).toContain(normalTableId);
      expect(ids).toContain(barTableId);
    },
  );
});
