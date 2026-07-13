/**
 * Promo code types — shared between admin UI, checkout validation, and DB layer.
 * Lives outside `admin/` so checkout (public) can import without bringing in
 * server-only admin dependencies.
 */

export type PromoDiscountType =
  | "percentage"
  | "fixed_amount"
  | "free_shipping";

export type PromoCode = {
  id: string;
  business_id: string;
  code: string;
  /** Si está set, el código es personal: solo ese cliente puede canjearlo. */
  customer_id: string | null;
  description: string | null;
  discount_type: PromoDiscountType;
  /**
   * Percentage: 0–100. Fixed amount: in cents. Free shipping: ignored (0).
   */
  discount_value: number;
  min_order_cents: number;
  max_uses: number | null;
  uses_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PromoApplyResult =
  | {
      ok: true;
      promo_code_id: string;
      code: string;
      discount_cents: number;
      /** True when this promo zeroes the delivery fee */
      free_shipping: boolean;
    }
  | { ok: false; error: string };

/**
 * Pure function: given a promo and the cart context, computes the discount
 * amount in cents. Used both by the server validator (persist-order) and by
 * the client preview that shows "Aplica $XXX off" in checkout before submit.
 *
 * Does NOT validate active/dates/max_uses — that's separate so we can show a
 * specific reason ("Vencido", "Usos agotados") in the UI. This only computes
 * the math.
 */
export function computePromoDiscount(
  promo: Pick<PromoCode, "discount_type" | "discount_value" | "min_order_cents">,
  ctx: { subtotalCents: number; deliveryFeeCents: number },
): { discount_cents: number; free_shipping: boolean; meets_minimum: boolean } {
  const meets_minimum = ctx.subtotalCents >= promo.min_order_cents;
  if (!meets_minimum) {
    return { discount_cents: 0, free_shipping: false, meets_minimum: false };
  }

  switch (promo.discount_type) {
    case "percentage": {
      const pct = Math.max(0, Math.min(100, promo.discount_value));
      const discount = Math.floor((ctx.subtotalCents * pct) / 100);
      return {
        discount_cents: discount,
        free_shipping: false,
        meets_minimum: true,
      };
    }
    case "fixed_amount": {
      const discount = Math.min(promo.discount_value, ctx.subtotalCents);
      return {
        discount_cents: discount,
        free_shipping: false,
        meets_minimum: true,
      };
    }
    case "free_shipping": {
      return {
        discount_cents: ctx.deliveryFeeCents,
        free_shipping: true,
        meets_minimum: true,
      };
    }
  }
}

/**
 * Format a discount for display. "20% OFF" / "$1500 OFF" / "Envío gratis".
 */
export function formatPromoDiscount(
  promo: Pick<PromoCode, "discount_type" | "discount_value">,
): string {
  switch (promo.discount_type) {
    case "percentage":
      return `${promo.discount_value}% OFF`;
    case "fixed_amount":
      return `$${(promo.discount_value / 100).toLocaleString("es-AR")} OFF`;
    case "free_shipping":
      return "Envío gratis";
  }
}
