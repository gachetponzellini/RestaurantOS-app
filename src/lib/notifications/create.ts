import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import {
  type NotificationPreference,
  type NotificationRecipient,
  resolveChannels,
} from "./preferences";
import { enqueueWhatsapp } from "./whatsapp-outbox";

type GenericClient = SupabaseClient;

/**
 * Texto del aviso para el canal WhatsApp interno (al negocio). El render rico
 * vive en `view.ts` (feed in-app); para WhatsApp alcanza con identificar el
 * evento. Hoy el envío es stub, así que esto es sobre todo un placeholder hasta
 * conectar Meta y resolver el teléfono del destinatario (cambio 14).
 */
function notificationWhatsappBody(
  type: string,
  payload: Record<string, unknown>,
): string {
  const label =
    typeof payload.tableLabel === "string"
      ? ` (mesa ${payload.tableLabel})`
      : typeof payload.orderNumber === "number"
        ? ` (pedido #${payload.orderNumber})`
        : "";
  return `Aviso: ${type}${label}`;
}

/**
 * Crea una notificación, ruteando destinatarios y canales según
 * `notification_preferences` en vez del `target_role`/`user_id` fijo del
 * call-site.
 *
 * - El destinatario "natural" sigue siendo el que pasa el call-site (userId o
 *   targetRole). Las preferencias deciden, para ese destinatario, qué canales
 *   usar. Sin preferencia explícita → `in_app` (back-compat exacto con hoy).
 * - Canal `in_app` → fila en `notifications` (idéntico al comportamiento previo).
 * - Canal `whatsapp` → se encola en `whatsapp_outbox` (best-effort, stub).
 *
 * Best-effort en todo: si algo falla, se loguea y sigue (igual que antes).
 */
export async function createNotification(params: {
  businessId: string;
  userId?: string | null;
  targetRole?: string | null;
  type: string;
  payload: Record<string, unknown>;
  /**
   * Usuario que ejecutó la acción. Si coincide con el destinatario puntual
   * (`userId`), la notificación se omite: no tiene sentido avisarle a alguien
   * de algo que acaba de hacer. Solo aplica a destinatarios `userId` — los
   * broadcast por `targetRole` insertan una fila para todo el rol y no pueden
   * excluir a un usuario puntual (limitación del modelo, ver spec 27).
   */
  actorUserId?: string | null;
}): Promise<void> {
  // Principio "no notificar al actor": destinatario puntual == actor → no se crea nada.
  if (params.userId && params.actorUserId && params.userId === params.actorUserId) {
    return;
  }

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const recipient: NotificationRecipient | null = params.userId
    ? { userId: params.userId }
    : params.targetRole
      ? { role: params.targetRole }
      : null;

  // Resolver canales desde las preferencias del negocio para este evento.
  let channels = ["in_app"] as ReturnType<typeof resolveChannels>;
  if (recipient) {
    const { data: prefs } = await service
      .from("notification_preferences")
      .select("event_type, target_role, target_user_id, channel, enabled")
      .eq("business_id", params.businessId)
      .eq("event_type", params.type);
    channels = resolveChannels(
      (prefs ?? []) as NotificationPreference[],
      params.type,
      recipient,
    );
  }

  if (channels.includes("in_app")) {
    const { error } = await service.from("notifications").insert({
      business_id: params.businessId,
      user_id: params.userId ?? null,
      target_role: params.targetRole ?? null,
      type: params.type,
      payload: params.payload,
    });
    if (error) console.error("createNotification", error);
  }

  if (channels.includes("whatsapp")) {
    // El teléfono del empleado destinatario se resuelve al conectar Meta
    // (cambio 14); hoy queda null y el envío es stub.
    await enqueueWhatsapp({
      businessId: params.businessId,
      toPhone: null,
      body: notificationWhatsappBody(params.type, params.payload),
      kind: "notification",
    });
  }
}
