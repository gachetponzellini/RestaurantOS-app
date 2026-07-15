import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import {
  normalizeCustomerChannel,
  pickChannels,
  type CustomerChannel,
} from "./customer-channel";
import { enqueueCustomerEmail } from "./customer-email-outbox";
import { enqueueWhatsapp, type WhatsappTemplate } from "./whatsapp-outbox";

type GenericClient = SupabaseClient;

/** Lee el canal de aviso al cliente del negocio (default whatsapp, best-effort). */
export async function resolveCustomerChannel(
  businessId: string,
): Promise<CustomerChannel> {
  try {
    const service = createSupabaseServiceClient() as unknown as GenericClient;
    const { data } = await service
      .from("businesses")
      .select("customer_channel")
      .eq("id", businessId)
      .maybeSingle();
    return normalizeCustomerChannel(
      (data as { customer_channel?: string } | null)?.customer_channel,
    );
  } catch (err) {
    console.error("resolveCustomerChannel", err);
    return normalizeCustomerChannel(null);
  }
}

export type CustomerDispatch = {
  businessId: string;
  /** Enum estable del evento, ej. "order_status:ready", "reservation_confirmed". */
  event: string;
  refId?: string | null;
  /** Si ya se resolvió el canal, se pasa para ahorrar la query. */
  channel?: CustomerChannel;
  recipient: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  /** Payload por canal. Se despacha sólo el canal activo con payload presente. */
  whatsapp?: { body: string; template?: WhatsappTemplate } | null;
  email?: {
    subject: string;
    html: string;
    text?: string;
    fromName?: string;
  } | null;
};

/**
 * Despacha un aviso al cliente por el canal configurado del negocio (spec 45).
 * Best-effort: nunca lanza. `both` intenta ambos de forma independiente. Cada
 * canal se despacha sólo si el caller le pasó el payload correspondiente, así
 * los eventos que aún no tienen template de WhatsApp (reserva, comprobante) no
 * generan filas `failed` en negocios en `whatsapp`.
 */
export async function dispatchCustomerMessage(
  params: CustomerDispatch,
): Promise<void> {
  try {
    const channel =
      params.channel ?? (await resolveCustomerChannel(params.businessId));
    const targets = pickChannels(channel);

    if (targets.whatsapp && params.whatsapp) {
      await enqueueWhatsapp({
        businessId: params.businessId,
        toPhone: params.recipient.phone ?? null,
        body: params.whatsapp.body,
        kind: "delivery_status",
        refId: params.refId ?? null,
        template: params.whatsapp.template,
      });
    }

    if (targets.email && params.email) {
      await enqueueCustomerEmail({
        businessId: params.businessId,
        event: params.event,
        refId: params.refId ?? null,
        to: params.recipient.email ?? null,
        subject: params.email.subject,
        html: params.email.html,
        text: params.email.text,
        fromName: params.email.fromName,
      });
    }
  } catch (err) {
    console.error("dispatchCustomerMessage", err);
  }
}
