import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { computePromoDiscount, type PromoCode } from "./types";

/**
 * Looks up + validates a promo code for a given business + cart.
 * Returns either a discount to apply, or a user-facing error reason.
 *
 * Does NOT increment uses_count — that happens atomically in persist-order
 * via the `increment_promo_use` RPC after the order is successfully inserted.
 *
 * Rules checked here:
 *   - exists in business
 *   - is_active = true
 *   - now() within [valid_from, valid_until]
 *   - uses_count < max_uses (if set)
 *   - subtotal >= min_order_cents
 *
 * The helper accepts a Supabase client (service role expected for checkout)
 * so it works both in API routes and server actions.
 */
export type ValidatedPromo = {
  promo_code_id: string;
  code: string;
  discount_cents: number;
  free_shipping: boolean;
};

export async function validatePromoCode(
  supabase: SupabaseClient,
  params: {
    businessId: string;
    code: string;
    subtotalCents: number;
    deliveryFeeCents: number;
    /**
     * Cliente que intenta canjear (spec 36 · R-D1). Si el promo es personal
     * (customer_id set), solo ese cliente puede usarlo. Anónimo = undefined.
     */
    customerId?: string | null;
  },
): Promise<{ ok: true; promo: ValidatedPromo } | { ok: false; error: string }> {
  const code = params.code.trim();
  if (!code) return { ok: false, error: "Ingresá un código." };

  // case-insensitive lookup, matches the unique index lower(code)
  const { data, error } = await supabase
    .from("promo_codes")
    .select(
      "id, business_id, code, customer_id, discount_type, discount_value, min_order_cents, max_uses, uses_count, valid_from, valid_until, is_active",
    )
    .eq("business_id", params.businessId)
    .ilike("code", code)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "El código no existe." };
  }

  const promo = data as Pick<
    PromoCode,
    | "id"
    | "code"
    | "customer_id"
    | "discount_type"
    | "discount_value"
    | "min_order_cents"
    | "max_uses"
    | "uses_count"
    | "valid_from"
    | "valid_until"
    | "is_active"
  >;

  // Códigos personales de campaña (spec 36 · R-D1): si el promo está asignado a
  // un cliente, solo ese cliente lo puede canjear. Antes NO se chequeaba, así
  // que cualquiera (incluso anónimo) que tipeara el código de otro obtenía el
  // descuento. El trigger de redención sí matchea customer_id, pero el descuento
  // igual se aplicaba = impacto en dinero.
  if (promo.customer_id && promo.customer_id !== params.customerId) {
    return { ok: false, error: "Este código es personal de otro cliente." };
  }

  if (!promo.is_active) {
    return { ok: false, error: "El código está desactivado." };
  }

  const now = Date.now();
  if (promo.valid_from && new Date(promo.valid_from).getTime() > now) {
    return { ok: false, error: "El código todavía no es válido." };
  }
  if (promo.valid_until && new Date(promo.valid_until).getTime() < now) {
    return { ok: false, error: "El código está vencido." };
  }
  if (
    promo.max_uses !== null &&
    promo.max_uses !== undefined &&
    promo.uses_count >= promo.max_uses
  ) {
    return { ok: false, error: "El código alcanzó el máximo de usos." };
  }

  const computed = computePromoDiscount(promo, {
    subtotalCents: params.subtotalCents,
    deliveryFeeCents: params.deliveryFeeCents,
  });

  if (!computed.meets_minimum) {
    const minPesos = (promo.min_order_cents / 100).toLocaleString("es-AR");
    return {
      ok: false,
      error: `Este código aplica con pedidos desde $${minPesos}.`,
    };
  }

  return {
    ok: true,
    promo: {
      promo_code_id: promo.id,
      code: promo.code,
      discount_cents: computed.discount_cents,
      free_shipping: computed.free_shipping,
    },
  };
}
