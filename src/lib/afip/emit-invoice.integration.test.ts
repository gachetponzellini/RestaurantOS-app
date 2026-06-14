// @vitest-environment node
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbAvailable = Boolean(supabaseUrl && serviceKey);

const TEST_TAG = `test-afip-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let CURRENT_USER_ID = "";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: { id: CURRENT_USER_ID } },
        error: null,
      }),
    },
  }),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: <T>(fn: T) => fn };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const { emitInvoice, anularFactura } = await import("./emit-invoice");

describe.skipIf(!dbAvailable)("afip/emitInvoice idempotencia (integration)", () => {
  const supabase = createClient(supabaseUrl!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let businessId: string;
  let businessSlug: string;
  let mozoId: string;

  const newOrder = async (total = 12_100) => {
    const { data: order } = await supabase
      .from("orders")
      .insert({
        business_id: businessId,
        customer_name: "AFIP",
        customer_phone: "0",
        delivery_type: "dine_in",
        subtotal_cents: total,
        total_cents: total,
        lifecycle_status: "open",
      })
      .select("id")
      .single();
    return order!.id as string;
  };

  beforeAll(async () => {
    const email = `${TEST_TAG}@example.test`;
    const { data: created } = await supabase.auth.admin.createUser({
      email,
      password: "test-pass-12345",
      email_confirm: true,
    });
    mozoId = created!.user!.id;
    await supabase.from("users").upsert({ id: mozoId, email, full_name: "Mozo" });

    const { data: biz } = await supabase
      .from("businesses")
      .insert({
        slug: TEST_TAG,
        name: "AFIP Test",
        is_active: true,
        afip_cuit: "20123456789",
        afip_punto_venta: 1,
        afip_mode: "sandbox",
      })
      .select("id, slug")
      .single();
    businessId = biz!.id;
    businessSlug = biz!.slug;

    await supabase.from("business_users").insert({
      business_id: businessId,
      user_id: mozoId,
      role: "encargado",
      full_name: "Mozo",
    });

    CURRENT_USER_ID = mozoId;
  });

  afterAll(async () => {
    if (businessId) {
      await supabase.from("businesses").delete().eq("id", businessId);
    }
    if (mozoId) {
      await supabase.from("users").delete().eq("id", mozoId);
      await supabase.auth.admin.deleteUser(mozoId);
    }
  });

  it("emite un comprobante en sandbox → authorized con CAE SANDBOX", { timeout: 30_000 }, async () => {
    const orderId = await newOrder();
    const r = await emitInvoice({ orderId, slug: businessSlug });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.invoice.status).toBe("authorized");
    expect(r.data.invoice.cae).toMatch(/^SANDBOX-/);
    expect(r.data.invoice.numero).not.toBeNull();
  });

  it("doble emisión con misma idempotency_key → un solo comprobante", { timeout: 30_000 }, async () => {
    const orderId = await newOrder();
    const key = `${orderId}:factura_b`;

    const r1 = await emitInvoice({ orderId, slug: businessSlug, idempotencyKey: key });
    const r2 = await emitInvoice({ orderId, slug: businessSlug, idempotencyKey: key });

    expect(r1.ok).toBe(true);
    // El segundo intento o devuelve el mismo comprobante, o rebota por guard.
    if (r2.ok && r1.ok) {
      expect(r2.data.invoice.id).toBe(r1.data.invoice.id);
    } else {
      expect(r2.ok).toBe(false);
    }

    const { count } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId)
      .eq("status", "authorized");
    expect(count).toBe(1);
  });

  it("orden ya facturada → rechaza re-emisión", { timeout: 30_000 }, async () => {
    const orderId = await newOrder();
    const first = await emitInvoice({ orderId, slug: businessSlug });
    expect(first.ok).toBe(true);

    const again = await emitInvoice({ orderId, slug: businessSlug });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error).toMatch(/ya tiene una factura autorizada/i);
  });

  it("anular → emite NC y deja la original cancelled con motivo", { timeout: 30_000 }, async () => {
    const orderId = await newOrder();
    const emitted = await emitInvoice({ orderId, slug: businessSlug });
    expect(emitted.ok).toBe(true);
    if (!emitted.ok) return;

    const motivo = "Factura mal hecha al mozo";
    const anulada = await anularFactura({
      invoiceId: emitted.data.invoice.id,
      motivo,
      slug: businessSlug,
    });
    expect(anulada.ok).toBe(true);
    if (!anulada.ok) return;

    expect(anulada.data.original.status).toBe("cancelled");
    expect(anulada.data.original.cancelled_reason).toBe(motivo);
    expect(anulada.data.notaCredito.tipo_comprobante).toBe("nota_credito_b");
    expect(anulada.data.notaCredito.status).toBe("authorized");
    expect(anulada.data.notaCredito.cancels_invoice_id).toBe(
      emitted.data.invoice.id,
    );
    expect(anulada.data.notaCredito.cae).toMatch(/^SANDBOX-NCB-/);
  });

  it("anular sin motivo → falla y no cambia la factura", { timeout: 30_000 }, async () => {
    const orderId = await newOrder();
    const emitted = await emitInvoice({ orderId, slug: businessSlug });
    expect(emitted.ok).toBe(true);
    if (!emitted.ok) return;

    const r = await anularFactura({
      invoiceId: emitted.data.invoice.id,
      motivo: "   ",
      slug: businessSlug,
    });
    expect(r.ok).toBe(false);

    const { data: still } = await supabase
      .from("invoices")
      .select("status")
      .eq("id", emitted.data.invoice.id)
      .single();
    expect((still as { status: string }).status).toBe("authorized");
  });

  it("re-facturar tras anular → emite nuevo comprobante authorized", { timeout: 30_000 }, async () => {
    const orderId = await newOrder();
    const first = await emitInvoice({ orderId, slug: businessSlug });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const anulada = await anularFactura({
      invoiceId: first.data.invoice.id,
      motivo: "Error de carga",
      slug: businessSlug,
    });
    expect(anulada.ok).toBe(true);

    // Con la original cancelled, el guard ya no bloquea: se re-factura.
    const refacturada = await emitInvoice({ orderId, slug: businessSlug });
    expect(refacturada.ok).toBe(true);
    if (!refacturada.ok) return;
    expect(refacturada.data.invoice.status).toBe("authorized");
    expect(refacturada.data.invoice.id).not.toBe(first.data.invoice.id);
  });
});
