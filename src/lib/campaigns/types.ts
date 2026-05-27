import type { CustomerSegment } from "@/lib/customers/segments";
import type { PromoDiscountType } from "@/lib/promos/types";

export type CampaignStatus = "draft" | "sending" | "sent" | "cancelled";
export type CampaignChannel = "manual" | "waba";
export type CampaignAudienceType = "segment" | "all" | "manual";

export const CAMPAIGN_CHANNELS: { value: CampaignChannel; label: string; available: boolean }[] = [
  { value: "manual", label: "Mi WhatsApp (manual)", available: true },
];

/**
 * Promo template — config that gets cloned per customer at launch time
 * to materialize personal promo_codes.
 */
export type PromoTemplate = {
  discount_type: PromoDiscountType;
  /** percent 0–100 or fixed amount in cents (free_shipping ignores this) */
  discount_value: number;
  min_order_cents: number;
  /**
   * Number of days the personal code is valid from launch_at. NULL = no expiry.
   */
  valid_for_days: number | null;
  /**
   * Single-use per customer = max_uses=1. Default true.
   */
  single_use: boolean;
  /** Optional prefix for the auto-generated code (e.g. "VUELVE" → "VUELVE-A1B2") */
  code_prefix?: string;
};

export type Campaign = {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  audience_type: CampaignAudienceType;
  audience_segment: CustomerSegment | null;
  audience_customer_ids: string[] | null;
  promo_template: PromoTemplate;
  message_template: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  audience_count: number;
  sent_count: number;
  redeemed_count: number;
  created_at: string;
  updated_at: string;
  launched_at: string | null;
};

export type CampaignMessage = {
  id: string;
  campaign_id: string;
  customer_id: string;
  customer_phone: string;
  customer_name: string | null;
  rendered_message: string;
  promo_code_id: string | null;
  promo_code_text: string | null;
  status: "pending" | "sent" | "failed";
  sent_at: string | null;
  redeemed_at: string | null;
  redeemed_order_id: string | null;
  created_at: string;
};
