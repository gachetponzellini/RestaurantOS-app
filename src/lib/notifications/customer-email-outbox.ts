import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { sendEmail } from "@/lib/email/send";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type GenericClient = SupabaseClient;

/**
 * Envía un email transaccional al cliente y lo registra en `customer_message_log`
 * (spec 45). Best-effort: NUNCA lanza ni bloquea la operación que lo originó.
 *
 * Idempotencia por `(business_id, event, ref_id, channel='email')`: si el evento
 * ya se envió (fila `sent`), no reenvía — así los reintentos de webhook (MP) no
 * duplican mails. Un `failed`/`skipped` previo SÍ se reintenta. Sin email
 * resoluble se registra `skipped` sin tocar la red.
 */
export async function enqueueCustomerEmail(params: {
  businessId: string;
  event: string;
  refId?: string | null;
  to: string | null;
  subject: string;
  html: string;
  text?: string;
  fromName?: string;
}): Promise<void> {
  try {
    const service = createSupabaseServiceClient() as unknown as GenericClient;
    const refId = params.refId ?? null;

    if (!params.to || params.to.trim() === "") {
      await writeLog(service, {
        business_id: params.businessId,
        event: params.event,
        ref_id: refId,
        channel: "email",
        status: "skipped",
        reason: "sin email del cliente",
        sent_at: null,
      });
      return;
    }

    // Idempotencia: si ya se envió, salir. (ref_id nullable → sólo deduplicamos
    // eventos con ref_id, que es el caso de todos los eventos idempotentes.)
    if (refId) {
      const { data: existing } = await service
        .from("customer_message_log")
        .select("status")
        .eq("business_id", params.businessId)
        .eq("event", params.event)
        .eq("ref_id", refId)
        .eq("channel", "email")
        .maybeSingle();
      if ((existing as { status?: string } | null)?.status === "sent") return;
    }

    const result = await sendEmail({
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
      fromName: params.fromName,
    });

    await writeLog(service, {
      business_id: params.businessId,
      event: params.event,
      ref_id: refId,
      channel: "email",
      status: result.ok ? "sent" : "failed",
      reason: result.ok ? null : result.error,
      sent_at: result.ok ? result.sent_at : null,
    });
  } catch (err) {
    console.error("enqueueCustomerEmail", err);
  }
}

async function writeLog(
  service: GenericClient,
  row: {
    business_id: string;
    event: string;
    ref_id: string | null;
    channel: string;
    status: string;
    reason: string | null;
    sent_at: string | null;
  },
): Promise<void> {
  const { error } = await service
    .from("customer_message_log")
    .upsert(row, { onConflict: "business_id,event,ref_id,channel" });
  if (error) console.error("customer_message_log upsert", error);
}
