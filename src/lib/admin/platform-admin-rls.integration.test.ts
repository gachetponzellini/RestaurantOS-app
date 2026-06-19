// @vitest-environment node
//
// Spec 26 — RLS: el platform admin lee/gestiona el back-office de CUALQUIER
// negocio aunque no sea miembro. A diferencia de los demás *.integration.test,
// acá NO usamos el service role para las aserciones (bypassearía RLS): montamos
// un cliente con el JWT real de cada usuario (publishable key + signInWithPassword)
// para que las policies se evalúen de verdad.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const dbAvailable = Boolean(supabaseUrl && serviceKey && anonKey);

const TEST_TAG = `test-platadmin-rls-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PASSWORD = "test-pass-12345";

describe.skipIf(!dbAvailable)("platform admin · RLS back-office (spec 26)", () => {
  // Service role: solo para SEED y cleanup (bypassea RLS).
  const admin = createClient(supabaseUrl!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Un cliente JWT por actor — las aserciones de RLS van por acá.
  const mkJwtClient = () =>
    createClient(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  const platformClient = mkJwtClient(); // platform admin, NO miembro
  const outsiderClient = mkJwtClient(); // autenticado, NO miembro, NO platform admin
  const memberClient = mkJwtClient(); // admin miembro del negocio

  let businessId = "";
  let platformAdminId = "";
  let outsiderId = "";
  let memberId = "";
  let promoId = "";
  let campaignId = "";
  let menuId = "";

  const mkUser = async (suffix: string, opts: { platform?: boolean } = {}) => {
    const email = `${TEST_TAG}-${suffix}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (error || !data?.user) throw new Error(`auth user ${suffix}: ${error?.message}`);
    const up = await admin.from("users").upsert({
      id: data.user.id,
      email,
      full_name: suffix,
      is_platform_admin: opts.platform ?? false,
    });
    if (up.error) throw new Error(`users upsert ${suffix}: ${up.error.message}`);
    return { id: data.user.id, email };
  };

  const signIn = async (client: SupabaseClient, email: string) => {
    const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
    if (error) throw new Error(`signIn ${email}: ${error.message}`);
  };

  beforeAll(async () => {
    const platform = await mkUser("plat", { platform: true });
    const outsider = await mkUser("outsider");
    const member = await mkUser("member");
    platformAdminId = platform.id;
    outsiderId = outsider.id;
    memberId = member.id;

    const { data: biz, error: bizErr } = await admin
      .from("businesses")
      .insert({ slug: TEST_TAG, name: "Plat RLS Test", is_active: true })
      .select("id")
      .single();
    if (bizErr || !biz) throw new Error(`biz: ${bizErr?.message}`);
    businessId = biz.id;

    // El "member" es admin del negocio; ni platform ni outsider son miembros.
    await admin.from("business_users").insert({
      business_id: businessId,
      user_id: memberId,
      role: "admin",
      full_name: "Member",
    });

    // Seed de back-office (las tres pantallas que reportaban vacío).
    const { data: promo } = await admin
      .from("promo_codes")
      .insert({
        business_id: businessId,
        code: `PROMO-${TEST_TAG}`,
        discount_type: "percentage",
        discount_value: 10,
      })
      .select("id")
      .single();
    promoId = promo!.id;

    const { data: campaign } = await admin
      .from("campaigns")
      .insert({
        business_id: businessId,
        name: `Campaña ${TEST_TAG}`,
        promo_template: { discount_type: "percentage", discount_value: 10, min_order_cents: 0 },
        message_template: "Hola {name}, usá {code}",
      })
      .select("id")
      .single();
    campaignId = campaign!.id;

    const { data: menu } = await admin
      .from("daily_menus")
      .insert({
        business_id: businessId,
        name: `Menú ${TEST_TAG}`,
        slug: `menu-${TEST_TAG}`,
        price_cents: 100000,
      })
      .select("id")
      .single();
    menuId = menu!.id;

    await Promise.all([
      signIn(platformClient, platform.email),
      signIn(outsiderClient, outsider.email),
      signIn(memberClient, member.email),
    ]);
  }, 30_000);

  afterAll(async () => {
    if (businessId) await admin.from("businesses").delete().eq("id", businessId);
    for (const uid of [platformAdminId, outsiderId, memberId].filter(Boolean)) {
      await admin.from("users").delete().eq("id", uid);
      await admin.auth.admin.deleteUser(uid).catch(() => undefined);
    }
  }, 30_000);

  // ── R1: platform admin no-miembro VE el back-office ──────────────
  it("platform admin no-miembro ve promos / campañas / menús del negocio", async () => {
    const [promos, campaigns, menus] = await Promise.all([
      platformClient.from("promo_codes").select("id").eq("business_id", businessId),
      platformClient.from("campaigns").select("id").eq("business_id", businessId),
      platformClient.from("daily_menus").select("id").eq("business_id", businessId),
    ]);
    expect(promos.data?.map((r) => r.id)).toContain(promoId);
    expect(campaigns.data?.map((r) => r.id)).toContain(campaignId);
    expect(menus.data?.map((r) => r.id)).toContain(menuId);
  });

  // ── R3.1: usuario común sigue bloqueado (no regresión) ───────────
  it("usuario común no-miembro NO ve nada del negocio", async () => {
    const [promos, campaigns, menus] = await Promise.all([
      outsiderClient.from("promo_codes").select("id").eq("business_id", businessId),
      outsiderClient.from("campaigns").select("id").eq("business_id", businessId),
      outsiderClient.from("daily_menus").select("id").eq("business_id", businessId),
    ]);
    expect(promos.data ?? []).toEqual([]);
    expect(campaigns.data ?? []).toEqual([]);
    expect(menus.data ?? []).toEqual([]);
  });

  // ── R3.2: miembro del negocio sigue viendo (no regresión) ────────
  it("admin miembro sigue viendo el back-office", async () => {
    const { data } = await memberClient
      .from("promo_codes")
      .select("id")
      .eq("business_id", businessId);
    expect(data?.map((r) => r.id)).toContain(promoId);
  });

  // ── R2: platform admin puede ESCRIBIR; común es rechazado ────────
  it("platform admin puede insertar una promo; el común es rechazado por RLS", async () => {
    const okInsert = await platformClient
      .from("promo_codes")
      .insert({
        business_id: businessId,
        code: `PLAT-INS-${TEST_TAG}`,
        discount_type: "percentage",
        discount_value: 5,
      })
      .select("id")
      .single();
    expect(okInsert.error).toBeNull();
    expect(okInsert.data?.id).toBeTruthy();

    const badInsert = await outsiderClient
      .from("promo_codes")
      .insert({
        business_id: businessId,
        code: `OUT-INS-${TEST_TAG}`,
        discount_type: "percentage",
        discount_value: 5,
      })
      .select("id")
      .single();
    expect(badInsert.error).not.toBeNull();
  });
});
