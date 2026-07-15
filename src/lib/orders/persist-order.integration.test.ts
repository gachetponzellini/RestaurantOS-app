// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { persistOrder } from "./persist-order";
import type { CreateOrderInput } from "./schema";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbAvailable = Boolean(supabaseUrl && serviceKey);

// Detectar si el seed `pizzanapoli` con sus products/modifiers requeridos
// existe. Si no, los tests se saltan en lugar de crashear en el beforeAll.
// DT-008 cerrada: este test depende de un seed local que no siempre está
// presente en la DB linkeada del piloto.
const REQUIRED_PRODUCTS = ["muzzarella", "agua-500"] as const;
const REQUIRED_MODIFIERS = ["Chica", "Grande", "Jamón"] as const;

async function isSeedAvailable(): Promise<boolean> {
  if (!dbAvailable) return false;
  const supabase = createClient(supabaseUrl!, serviceKey!);
  const { data: products } = await supabase
    .from("products")
    .select("slug")
    .in("slug", REQUIRED_PRODUCTS);
  if (!products || products.length !== REQUIRED_PRODUCTS.length) return false;
  const { data: modifiers } = await supabase
    .from("modifiers")
    .select("name")
    .in("name", REQUIRED_MODIFIERS);
  return Boolean(modifiers && modifiers.length === REQUIRED_MODIFIERS.length);
}

// Top-level await en vitest: la suite se evalúa de manera async cuando se
// usa describe.skipIf con una expresión. `await` acá funciona dentro del
// archivo de test.
const seedReady = await isSeedAvailable();

describe.skipIf(!seedReady)("persistOrder (integration)", () => {
  const supabase = createClient(supabaseUrl!, serviceKey!);
  let productMuzzaId: string;
  let productAguaId: string;
  let modChicaId: string;
  let modGrandeId: string;
  let modJamonId: string;

  beforeAll(async () => {
    const { data: products } = await supabase
      .from("products")
      .select("id, slug")
      .in("slug", REQUIRED_PRODUCTS);
    productMuzzaId = products!.find((p) => p.slug === "muzzarella")!.id;
    productAguaId = products!.find((p) => p.slug === "agua-500")!.id;

    const { data: modifiers } = await supabase
      .from("modifiers")
      .select("id, name")
      .in("name", REQUIRED_MODIFIERS);
    modChicaId = modifiers!.find((m) => m.name === "Chica")!.id;
    modGrandeId = modifiers!.find((m) => m.name === "Grande")!.id;
    modJamonId = modifiers!.find((m) => m.name === "Jamón")!.id;
  });

  it("creates a pickup order and snapshots names/prices", async () => {
    const input: CreateOrderInput = {
      business_slug: "pizzanapoli",
      delivery_type: "pickup",
      customer_name: "Test Pickup",
      customer_phone: "+5491100000001",
      items: [
        {
          product_id: productMuzzaId,
          quantity: 2,
          modifier_ids: [modGrandeId, modJamonId],
        },
        {
          product_id: productAguaId,
          quantity: 1,
          modifier_ids: [],
        },
      ],
    };

    const result = await persistOrder(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.order_number).toBeGreaterThan(0);

    const { data: order } = await supabase
      .from("orders")
      .select("subtotal_cents, total_cents, delivery_fee_cents, status")
      .eq("id", result.data.order_id)
      .single();

    // Muzzarella 1000000 + Grande 300000 + Jamon 80000 = 1380000 * 2 = 2760000
    // Agua 150000 * 1 = 150000
    // Subtotal = 2910000
    expect(order!.subtotal_cents).toBe(2910000);
    expect(order!.delivery_fee_cents).toBe(0);
    expect(order!.total_cents).toBe(2910000);
    expect(order!.status).toBe("pending");

    const { data: items } = await supabase
      .from("order_items")
      .select("product_name, unit_price_cents, quantity, subtotal_cents")
      .eq("order_id", result.data.order_id)
      .order("subtotal_cents", { ascending: false });
    expect(items).toHaveLength(2);
    expect(items![0]).toMatchObject({
      product_name: "Pizza Muzzarella",
      unit_price_cents: 1000000,
      quantity: 2,
      subtotal_cents: 2760000,
    });

    const { data: mods } = await supabase
      .from("order_item_modifiers")
      .select("modifier_name, price_delta_cents, order_items!inner(order_id)")
      .eq("order_items.order_id", result.data.order_id);
    const names = mods!.map((m) => m.modifier_name).sort();
    expect(names).toEqual(["Grande", "Jamón"]);

    const { data: history } = await supabase
      .from("order_status_history")
      .select("status")
      .eq("order_id", result.data.order_id);
    expect(history!.map((h) => h.status)).toContain("pending");

    // spec 047 — el efectivo remoto NO marcha al crearse: queda en `pending`
    // (arriba), sin comandas y sin haber pasado por `preparing`. La marcha la
    // hace el encargado a mano (confirmarPedido → routeOrderToCocina).
    const { count: comandaCount } = await supabase
      .from("comandas")
      .select("id", { count: "exact", head: true })
      .eq("order_id", result.data.order_id);
    expect(comandaCount ?? 0).toBe(0);
    expect(history!.map((h) => h.status)).not.toContain("preparing");
  });

  it("applies delivery fee for delivery orders", async () => {
    const input: CreateOrderInput = {
      business_slug: "pizzanapoli",
      delivery_type: "delivery",
      customer_name: "Test Delivery",
      customer_phone: "+5491100000002",
      delivery_address: "Av. Corrientes 999",
      items: [
        { product_id: productMuzzaId, quantity: 1, modifier_ids: [modChicaId] },
      ],
    };

    const result = await persistOrder(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { data: order } = await supabase
      .from("orders")
      .select("subtotal_cents, delivery_fee_cents, total_cents")
      .eq("id", result.data.order_id)
      .single();
    // Muzzarella 1000000 + Chica 0 = 1000000
    // Pizzanapoli business-level delivery fee (seed) = 150000
    expect(order!.subtotal_cents).toBe(1000000);
    expect(order!.delivery_fee_cents).toBe(150000);
    expect(order!.total_cents).toBe(1150000);
  });

  it("reuses customer when phone repeats", async () => {
    const phone = "+5491100000999";
    const input: CreateOrderInput = {
      business_slug: "pizzanapoli",
      delivery_type: "pickup",
      customer_name: "Repetido",
      customer_phone: phone,
      items: [{ product_id: productAguaId, quantity: 1, modifier_ids: [] }],
    };
    const a = await persistOrder(input);
    const b = await persistOrder(input);
    expect(a.ok && b.ok).toBe(true);

    const { data: customers } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", phone);
    expect(customers).toHaveLength(1);
  });

  it("rejects order with unknown product", async () => {
    const result = await persistOrder({
      business_slug: "pizzanapoli",
      delivery_type: "pickup",
      customer_name: "x",
      customer_phone: "1",
      items: [
        {
          product_id: "00000000-0000-4000-8000-000000000000",
          quantity: 1,
          modifier_ids: [],
        },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it("auto-assigns incrementing order_number", async () => {
    const input: CreateOrderInput = {
      business_slug: "pizzanapoli",
      delivery_type: "pickup",
      customer_name: "Seq",
      customer_phone: "+5491100000555",
      items: [{ product_id: productAguaId, quantity: 1, modifier_ids: [] }],
    };
    const a = await persistOrder(input);
    const b = await persistOrder(input);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(b.data.order_number).toBe(a.data.order_number + 1);
  });
});
