import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import type { ValidatedPromo } from "./validate";
import { validatePromoCode } from "./validate";

/**
 * Finds and validates a personal promo code assigned to a user (via the
 * customers → promo_codes.customer_id relationship added in 0019_campaigns).
 * Returns the first valid coupon, or null.
 */
export async function getAssignedCoupon(
  userId: string,
  businessId: string,
  subtotalCents: number,
  deliveryFeeCents: number,
): Promise<ValidatedPromo | null> {
  const service = createSupabaseServiceClient();

  // Resolve the customer row for this auth user + business.
  const { data: customer } = await service
    .from("customers")
    .select("id")
    .eq("user_id", userId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (!customer) return null;

  // Find personal promo codes assigned to this customer.
  const { data: promos } = await service
    .from("promo_codes")
    .select("code")
    .eq("business_id", businessId)
    .eq("customer_id", customer.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!promos || promos.length === 0) return null;

  for (const promo of promos) {
    const result = await validatePromoCode(service, {
      businessId,
      code: promo.code,
      subtotalCents,
      deliveryFeeCents,
      // Estos promos ya están filtrados por customer_id = customer.id; pasamos
      // el id para que el gate de código personal (R-D1) los deje pasar.
      customerId: customer.id,
    });
    if (result.ok) return result.promo;
  }

  return null;
}
