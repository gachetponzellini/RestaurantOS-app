import "server-only";

import { formatInTimeZone } from "date-fns-tz";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { renderDeliveryMessage } from "./delivery-templates";
import { enqueueWhatsapp } from "./whatsapp-outbox";

const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

/**
 * Encola el WhatsApp al cliente tras un cambio de estado de delivery.
 *
 * Best-effort: NUNCA lanza ni bloquea el cambio de estado. Resuelve todo desde
 * `orderId` con el service client (el pedido ya fue actualizado por el caller),
 * arma el mensaje con la plantilla del negocio (o la default) y lo encola en
 * `whatsapp_outbox`. Si no corresponde enviar (estado no notificable, take-away
 * en "en camino", pedido en salón, sin teléfono, plantilla apagada) `renderable`
 * es null y no se encola nada.
 */
export async function notifyDeliveryStatusChange(params: {
  orderId: string;
  toStatus: string;
}): Promise<void> {
  try {
    const service = createSupabaseServiceClient();

    const { data: order } = await service
      .from("orders")
      .select(
        "id, business_id, order_number, customer_name, customer_phone, delivery_type",
      )
      .eq("id", params.orderId)
      .maybeSingle();
    if (!order) return;

    const { data: business } = await service
      .from("businesses")
      .select("name, timezone")
      .eq("id", order.business_id)
      .maybeSingle();
    if (!business) return;

    // Plantilla editable del dueño para este estado (si la cargó). Sin fila →
    // la lógica pura cae a la plantilla default.
    const { data: template } = await service
      .from("delivery_message_templates")
      .select("body, enabled, template_name, template_lang")
      .eq("business_id", order.business_id)
      .eq("status", params.toStatus)
      .maybeSingle();

    const body = renderDeliveryMessage({
      status: params.toStatus,
      deliveryType: order.delivery_type,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      orderNumber: order.order_number,
      businessName: business.name,
      template: template ?? null,
      timezone: business.timezone ?? undefined,
    });
    if (!body) return;

    // Aviso proactivo → se manda como template message aprobado por Meta (fuera
    // de la ventana de 24h el texto libre se rechaza). Convención de parámetros
    // del template: {{1}} = nombre del cliente, {{2}} = número de pedido. Sin
    // `template_name` configurado, enqueueWhatsapp lo deja en `failed` con motivo.
    const tpl = template?.template_name
      ? {
          name: template.template_name,
          lang: template.template_lang ?? "es_AR",
          params: [order.customer_name, String(order.order_number)],
        }
      : undefined;

    await enqueueWhatsapp({
      businessId: order.business_id,
      toPhone: order.customer_phone,
      body,
      kind: "delivery_status",
      refId: order.id,
      template: tpl,
    });
  } catch (err) {
    console.error("notifyDeliveryStatusChange", err);
  }
}

/**
 * Aviso al cliente de que su pedido diferido (spec 31) quedó **agendado** tras
 * aprobarse el pago MP. Es el primer aviso del flujo; el "listo para retirar"
 * sale después por el cambio de estado normal (`ready` → notifyDeliveryStatusChange).
 *
 * Best-effort (nunca lanza). Sólo aplica a pickup con `scheduled_at`. Como todo
 * aviso proactivo, va por el outbox de WhatsApp; sin template aprobado por Meta
 * queda registrado en `failed` con motivo (mismo límite que el resto hoy).
 */
export async function notifyScheduledConfirmed(params: {
  orderId: string;
}): Promise<void> {
  try {
    const service = createSupabaseServiceClient();

    const { data: order } = await service
      .from("orders")
      .select(
        "id, business_id, order_number, customer_name, customer_phone, delivery_type, scheduled_at",
      )
      .eq("id", params.orderId)
      .maybeSingle();
    if (!order || !order.scheduled_at) return;
    if (order.delivery_type !== "pickup") return;
    if (!order.customer_phone || order.customer_phone.trim().length === 0) {
      return;
    }

    const { data: business } = await service
      .from("businesses")
      .select("name, timezone")
      .eq("id", order.business_id)
      .maybeSingle();
    if (!business) return;

    const tz = business.timezone ?? DEFAULT_TZ;
    const cuando = formatInTimeZone(
      new Date(order.scheduled_at),
      tz,
      "dd/MM 'a las' HH:mm 'hs'",
    );
    const body =
      `¡Listo ${order.customer_name}! Tu pedido #${order.order_number} quedó ` +
      `agendado para el ${cuando}. Te avisamos cuando esté para retirar. 🙌`;

    await enqueueWhatsapp({
      businessId: order.business_id,
      toPhone: order.customer_phone,
      body,
      kind: "delivery_status",
      refId: order.id,
    });
  } catch (err) {
    console.error("notifyScheduledConfirmed", err);
  }
}
