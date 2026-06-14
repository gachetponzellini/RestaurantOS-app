"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { resolveAudience, serviceClient } from "@/lib/admin/campaigns-query";
import { formatPromoDiscount } from "@/lib/promos/types";
import type { PromoTemplate } from "@/lib/campaigns/types";
import {
  generatePromoCode,
  renderTemplate,
} from "@/lib/campaigns/template";
import type { BusinessRole } from "@/lib/admin/context";
import { canManageCampaigns } from "@/lib/permissions/can";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PromoTemplateSchema: z.ZodType<PromoTemplate> = z.object({
  discount_type: z.enum(["percentage", "fixed_amount", "free_shipping"]),
  discount_value: z.coerce.number().int().min(0),
  min_order_cents: z.coerce.number().int().min(0).default(0),
  valid_for_days: z
    .union([z.coerce.number().int().min(1), z.null()])
    .nullable()
    .default(30),
  single_use: z.boolean().default(true),
  code_prefix: z.string().trim().max(12).optional(),
});

const CreateInput = z.object({
  business_slug: z.string().min(1),
  name: z.string().trim().min(1, "Requerido.").max(120),
  description: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v === "" ? null : (v ?? null))),
  audience_type: z.enum(["segment", "all", "manual"]),
  audience_segment: z
    .enum(["new", "frequent", "top", "inactive", "lost", "regular"])
    .nullable()
    .optional(),
  audience_customer_ids: z.array(z.string().uuid()).optional(),
  promo_template: PromoTemplateSchema,
  message_template: z.string().min(1, "Escribí un mensaje.").max(1000),
  channel: z.enum(["manual", "waba"]).default("manual"),
});

const LaunchInput = z.object({
  business_slug: z.string().min(1),
  campaign_id: z.string().uuid(),
});

const DeleteInput = LaunchInput;

const MarkSentInput = z.object({
  business_slug: z.string().min(1),
  message_id: z.string().uuid(),
  sent: z.boolean().default(true),
});

async function assertCanManage(businessSlug: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "No autenticado." };

  const service = serviceClient();
  const { data: business } = await service
    .from("businesses")
    .select("id, name")
    .eq("slug", businessSlug)
    .maybeSingle();
  if (!business) return { ok: false as const, error: "Negocio no encontrado." };

  const [{ data: profile }, { data: membership }] = await Promise.all([
    service.from("users").select("is_platform_admin").eq("id", user.id).maybeSingle(),
    service
      .from("business_users")
      .select("role")
      .eq("business_id", business.id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const isPlatformAdmin = profile?.is_platform_admin ?? false;
  const role = membership?.role as BusinessRole | undefined;
  if (!isPlatformAdmin && (!role || !canManageCampaigns(role))) {
    return { ok: false as const, error: "Permiso denegado." };
  }
  return {
    ok: true as const,
    businessId: business.id as string,
    businessName: business.name as string,
  };
}

export async function createCampaign(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  }
  const guard = await assertCanManage(parsed.data.business_slug);
  if (!guard.ok) return actionError(guard.error);

  // Resolve audience for preview/count
  const customers = await resolveAudience(guard.businessId, {
    type: parsed.data.audience_type,
    segment: parsed.data.audience_segment ?? null,
    customer_ids: parsed.data.audience_customer_ids ?? null,
  });

  const service = serviceClient();
  const { data, error } = await service
    .from("campaigns")
    .insert({
      business_id: guard.businessId,
      name: parsed.data.name,
      description: parsed.data.description,
      audience_type: parsed.data.audience_type,
      audience_segment: parsed.data.audience_segment ?? null,
      audience_customer_ids: parsed.data.audience_customer_ids ?? null,
      promo_template: parsed.data.promo_template,
      message_template: parsed.data.message_template,
      channel: parsed.data.channel,
      audience_count: customers.length,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createCampaign", error);
    return actionError("No pudimos crear la campaña.");
  }

  revalidatePath(`/${parsed.data.business_slug}/admin/campanas`);
  return actionOk({ id: data.id as string });
}

export async function launchCampaign(
  input: unknown,
): Promise<ActionResult<{ messages_created: number }>> {
  const parsed = LaunchInput.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");
  const guard = await assertCanManage(parsed.data.business_slug);
  if (!guard.ok) return actionError(guard.error);

  const service = serviceClient();

  // 1. Read campaign + verify ownership + status='draft'
  const { data: campaign } = await service
    .from("campaigns")
    .select("*")
    .eq("id", parsed.data.campaign_id)
    .eq("business_id", guard.businessId)
    .maybeSingle();
  if (!campaign) return actionError("Campaña no encontrada.");
  if (campaign.status !== "draft") {
    return actionError("Esta campaña ya fue lanzada o cancelada.");
  }

  // 2. Resolve audience
  const customers = await resolveAudience(guard.businessId, {
    type: campaign.audience_type,
    segment: campaign.audience_segment,
    customer_ids: campaign.audience_customer_ids,
  });
  if (customers.length === 0) {
    return actionError("La audiencia está vacía. No hay clientes a quienes enviar.");
  }

  const promoTemplate = campaign.promo_template as PromoTemplate;
  const validUntil =
    promoTemplate.valid_for_days !== null
      ? new Date(
          Date.now() + promoTemplate.valid_for_days * 24 * 60 * 60 * 1000,
        ).toISOString()
      : null;

  const discountLabel = formatPromoDiscount(promoTemplate);
  const launchedAt = new Date().toISOString();

  // 3. For each customer: create personal promo + render message + insert
  //    campaign_message. We do this serially to stay below DB connection
  //    limits — the volumes here (typically <200 per campaign) make it fine.
  let createdCount = 0;
  for (const customer of customers) {
    // Generate a unique code (retry on collision — extremely rare with 6 chars)
    let code = "";
    let attempt = 0;
    while (attempt < 5) {
      code = generatePromoCode(promoTemplate.code_prefix);
      const { data: clash } = await service
        .from("promo_codes")
        .select("id")
        .eq("business_id", guard.businessId)
        .ilike("code", code)
        .maybeSingle();
      if (!clash) break;
      attempt += 1;
    }
    if (!code) continue; // give up on this customer

    // Insert personal promo
    const { data: promo, error: promoErr } = await service
      .from("promo_codes")
      .insert({
        business_id: guard.businessId,
        customer_id: customer.id,
        code,
        description: `Personal · campaña ${campaign.name}`,
        discount_type: promoTemplate.discount_type,
        discount_value:
          promoTemplate.discount_type === "free_shipping"
            ? 0
            : promoTemplate.discount_value,
        min_order_cents: promoTemplate.min_order_cents,
        max_uses: promoTemplate.single_use ? 1 : null,
        valid_until: validUntil,
        is_active: true,
      })
      .select("id, code")
      .single();
    if (promoErr || !promo) {
      console.error("personal promo insert", promoErr);
      continue;
    }

    // Render message
    const rendered = renderTemplate(campaign.message_template, {
      name: customer.name,
      code: promo.code as string,
      discount: discountLabel,
      business: guard.businessName,
    });

    // Insert campaign_message
    const { error: msgErr } = await service.from("campaign_messages").insert({
      campaign_id: campaign.id,
      customer_id: customer.id,
      customer_phone: customer.phone,
      customer_name: customer.name,
      rendered_message: rendered,
      promo_code_id: promo.id,
      promo_code_text: promo.code,
      status: "pending",
    });
    if (msgErr) {
      console.error("campaign_message insert", msgErr);
      continue;
    }
    createdCount += 1;
  }

  // 4. Update campaign status + counters
  await service
    .from("campaigns")
    .update({
      status: "sent", // For manual: "sent" means messages are ready to be dispatched by owner.
      audience_count: customers.length,
      launched_at: launchedAt,
    })
    .eq("id", campaign.id);

  revalidatePath(`/${parsed.data.business_slug}/admin/campanas`);
  revalidatePath(`/${parsed.data.business_slug}/admin/campanas/${campaign.id}`);
  return actionOk({ messages_created: createdCount });
}

export async function cancelCampaign(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = LaunchInput.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");
  const guard = await assertCanManage(parsed.data.business_slug);
  if (!guard.ok) return actionError(guard.error);

  const service = serviceClient();
  const { error } = await service
    .from("campaigns")
    .update({ status: "cancelled" })
    .eq("id", parsed.data.campaign_id)
    .eq("business_id", guard.businessId)
    .eq("status", "draft");
  if (error) return actionError("No pudimos cancelar la campaña.");

  revalidatePath(`/${parsed.data.business_slug}/admin/campanas`);
  return actionOk(null);
}

export async function deleteCampaign(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");
  const guard = await assertCanManage(parsed.data.business_slug);
  if (!guard.ok) return actionError(guard.error);

  const service = serviceClient();
  // Cascade deletes campaign_messages. Personal promo_codes tied to those
  // messages get their `campaign_messages.promo_code_id` set to NULL via the
  // ON DELETE SET NULL on that FK — codes themselves stay valid for the
  // customer (in case they already received the WhatsApp).
  const { error } = await service
    .from("campaigns")
    .delete()
    .eq("id", parsed.data.campaign_id)
    .eq("business_id", guard.businessId);
  if (error) return actionError("No pudimos eliminar la campaña.");

  revalidatePath(`/${parsed.data.business_slug}/admin/campanas`);
  return actionOk(null);
}

export async function markCampaignMessageSent(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = MarkSentInput.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");
  const guard = await assertCanManage(parsed.data.business_slug);
  if (!guard.ok) return actionError(guard.error);

  const service = serviceClient();
  // Pull the message + verify ownership via campaign.business_id
  const { data: msg } = await service
    .from("campaign_messages")
    .select("campaign_id, status, campaigns(business_id)")
    .eq("id", parsed.data.message_id)
    .maybeSingle();
  if (!msg) return actionError("Mensaje no encontrado.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaignBusinessId = (msg as any).campaigns?.business_id as string | undefined;
  if (campaignBusinessId !== guard.businessId) {
    return actionError("Permiso denegado.");
  }

  const nextStatus = parsed.data.sent ? "sent" : "pending";
  const sentAt = parsed.data.sent ? new Date().toISOString() : null;
  await service
    .from("campaign_messages")
    .update({ status: nextStatus, sent_at: sentAt })
    .eq("id", parsed.data.message_id);

  // Update campaign sent_count (best effort — derived from campaign_messages)
  const { count } = await service
    .from("campaign_messages")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", msg.campaign_id)
    .eq("status", "sent");
  await service
    .from("campaigns")
    .update({ sent_count: count ?? 0 })
    .eq("id", msg.campaign_id);

  revalidatePath(
    `/${parsed.data.business_slug}/admin/campanas/${msg.campaign_id}`,
  );
  return actionOk(null);
}
