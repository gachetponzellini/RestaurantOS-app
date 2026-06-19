/**
 * Preferencias de notificación: quién recibe qué evento interno y por qué canal.
 *
 * Reemplaza el ruteo hardcodeado en cada `createNotification(...)`. El modelo es
 * un **modulador del destinatario natural**: cada call-site sigue sabiendo a
 * quién va dirigido el evento (el rol o usuario de siempre), y las preferencias
 * sólo deciden — para ese destinatario — qué canales se usan (`in_app`,
 * `whatsapp`) o si se silencia.
 *
 * Back-compat sin seed: si no hay ninguna preferencia que matchee al
 * destinatario para ese evento, el default es `in_app` (idéntico a hoy). La
 * tabla `notification_preferences` arranca vacía y nada cambia hasta que el
 * dueño configure algo.
 *
 * La resolución es lógica pura (sin DB) para testearla fácil; el caller le pasa
 * las filas ya leídas de `notification_preferences`.
 */

export type NotificationChannel = "in_app" | "whatsapp";

export type NotificationPreference = {
  event_type: string;
  target_role: string | null;
  target_user_id: string | null;
  channel: NotificationChannel;
  enabled: boolean;
};

/** El destinatario "natural" que el call-site quiere notificar. */
export type NotificationRecipient =
  | { role: string }
  | { userId: string };

/** Eventos internos notificables (los que hoy dispara el sistema). */
export const NOTIFICATION_EVENTS = [
  { type: "order.pending", label: "Pedido nuevo entrante" },
  { type: "mesa.transferred", label: "Mesa transferida" },
  { type: "mesa.cancelled", label: "Mesa anulada" },
  { type: "comanda.entregada", label: "Comanda entregada" },
  // spec 27 — ampliación de eventos (solo a encargado/mozo, no admin)
  { type: "reserva.nueva", label: "Reserva nueva" },
  { type: "reserva.cancelada_cliente", label: "Reserva cancelada por el cliente" },
  { type: "order.cancelled_by_customer", label: "Pedido cancelado por el cliente" },
  { type: "mesa.pidio_cuenta", label: "Mesa pidió la cuenta" },
  { type: "item.cancelado", label: "Ítem anulado" },
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENTS)[number]["type"];

export const NOTIFICATION_EVENT_TYPES = NOTIFICATION_EVENTS.map(
  (e) => e.type,
) as [NotificationEventType, ...NotificationEventType[]];

export const NOTIFICATION_CHANNELS: [NotificationChannel, ...NotificationChannel[]] =
  ["in_app", "whatsapp"];

/** Roles internos que pueden ser destinatarios de notificaciones. */
export const NOTIFICATION_TARGET_ROLES = ["admin", "encargado", "mozo"] as const;

/** Default back-compat cuando no hay preferencia explícita: sólo in_app. */
const DEFAULT_CHANNELS: NotificationChannel[] = ["in_app"];

function matchesRecipient(
  pref: NotificationPreference,
  recipient: NotificationRecipient,
): boolean {
  if ("userId" in recipient) return pref.target_user_id === recipient.userId;
  return pref.target_role === recipient.role;
}

/**
 * Canales por los que entregar `eventType` al `recipient`, según las prefs.
 * - Sin prefs que matcheen → `["in_app"]` (back-compat).
 * - Con prefs → sólo los canales habilitados (puede ser `[]` = silenciado).
 */
export function resolveChannels(
  prefs: NotificationPreference[],
  eventType: string,
  recipient: NotificationRecipient,
): NotificationChannel[] {
  const matching = prefs.filter(
    (p) => p.event_type === eventType && matchesRecipient(p, recipient),
  );
  if (matching.length === 0) return [...DEFAULT_CHANNELS];
  const channels = matching.filter((p) => p.enabled).map((p) => p.channel);
  return [...new Set(channels)];
}
