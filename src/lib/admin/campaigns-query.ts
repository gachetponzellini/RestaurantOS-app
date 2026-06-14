import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { listCustomers, type CustomerListItem } from "@/lib/admin/customers-query";
import type {
  Campaign,
  CampaignAudienceType,
  CampaignMessage,
} from "@/lib/campaigns/types";
import type { CustomerSegment } from "@/lib/customers/segments";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// NOTE: cast to generic SupabaseClient until database.types.ts is regenerated
// after migration 0019 is applied. Remove `as unknown as ...` after regen.
type GenericClient = SupabaseClient;

export async function listCampaigns(businessId: string): Promise<Campaign[]> {
  const supabase = (await createSupabaseServerClient()) as unknown as GenericClient;
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Campaign[];
}

export async function getCampaign(
  businessId: string,
  campaignId: string,
): Promise<Campaign | null> {
  const supabase = (await createSupabaseServerClient()) as unknown as GenericClient;
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("business_id", businessId)
    .eq("id", campaignId)
    .maybeSingle();
  return (data ?? null) as Campaign | null;
}

export async function listCampaignMessages(
  campaignId: string,
): Promise<CampaignMessage[]> {
  const supabase = (await createSupabaseServerClient()) as unknown as GenericClient;
  const { data } = await supabase
    .from("campaign_messages")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  return (data ?? []) as CampaignMessage[];
}

/**
 * Resolves an audience definition into the actual list of customers.
 * Used at launch time (to materialize messages) and also for the preview
 * in the create wizard ("¿a cuántos clientes les vas a enviar?").
 *
 * Reuses `listCustomers()` so segmentation logic stays in one place
 * (lib/customers/segments.ts).
 */
export async function resolveAudience(
  businessId: string,
  audience: {
    type: CampaignAudienceType;
    segment: CustomerSegment | null;
    customer_ids: string[] | null;
  },
): Promise<CustomerListItem[]> {
  if (audience.type === "manual") {
    if (!audience.customer_ids?.length) return [];
    // For manual list, fetch all and filter — `listCustomers` doesn't have an
    // `IN` filter today, so we paginate through everything (low volume in
    // practice). Future optimization: add a customers-by-ids query.
    const all = await listCustomers(businessId, { limit: 100, page: 1 });
    const idSet = new Set(audience.customer_ids);
    return all.customers.filter((c) => idSet.has(c.id));
  }

  if (audience.type === "all") {
    const result = await listCustomers(businessId, { segment: "all", limit: 100, page: 1 });
    return result.customers.filter((c) => c.order_count > 0); // skip zero-order edges
  }

  // segment
  const segment = audience.segment ?? "all";
  const result = await listCustomers(businessId, { segment, limit: 100, page: 1 });
  return result.customers;
}

export async function getCampaignRedemptionAmount(
  campaignId: string,
): Promise<number> {
  const supabase = (await createSupabaseServerClient()) as unknown as GenericClient;

  const { data: messages } = await supabase
    .from("campaign_messages")
    .select("promo_code_id")
    .eq("campaign_id", campaignId)
    .not("redeemed_at", "is", null);

  if (!messages?.length) return 0;
  const promoIds = (messages as { promo_code_id: string }[])
    .map((m) => m.promo_code_id)
    .filter(Boolean);
  if (promoIds.length === 0) return 0;

  const { data: orders } = await supabase
    .from("orders")
    .select("total_cents, tip_cents")
    .in("promo_code_id", promoIds)
    .neq("status", "cancelled");

  let totalCents = 0;
  for (const o of orders ?? []) {
    const row = o as { total_cents: number; tip_cents: number | null };
    totalCents += Number(row.total_cents) - (Number(row.tip_cents) || 0);
  }
  return totalCents;
}

/**
 * Service-role variant for use inside server actions that need to bypass RLS
 * (the launch action runs in the user's session but uses service for cross-
 * customer operations).
 */
export function serviceClient(): GenericClient {
  return createSupabaseServiceClient() as unknown as GenericClient;
}
