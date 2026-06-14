/**
 * Channel abstraction — how a campaign message is delivered.
 *
 * Today: only "manual" (the owner clicks wa.me links from the campaign detail
 * and sends each message from their personal WhatsApp).
 *
 * Future: "waba" — the dispatcher iterates campaign_messages and sends each
 * via Meta WhatsApp Cloud API. The interface stays identical.
 */

import { sendWhatsapp } from "@/lib/notifications/whatsapp-sender";

import type { CampaignChannel, CampaignMessage } from "./types";

export type DispatchResult =
  | { ok: true; sent_at: string }
  | { ok: false; error: string };

export type Channel = {
  /** Human label for UI */
  label: string;
  /** Whether this channel can actually send (false = stub / coming-soon) */
  available: boolean;
  /**
   * For "manual" this is a no-op (returns ok immediately) since the owner
   * sends from their phone and marks each message as sent manually via the UI.
   * For "waba" this sends via 360dialog (resolviendo credenciales por negocio).
   */
  dispatch(message: CampaignMessage, businessId: string): Promise<DispatchResult>;
};

export const manualChannel: Channel = {
  label: "Mi WhatsApp (manual)",
  available: true,
  async dispatch() {
    // The "manual" channel doesn't actually deliver — it just marks ready.
    // The owner does the actual sending via wa.me deep links and clicks
    // "Marcar enviado" in the UI which updates campaign_messages.status.
    return { ok: true, sent_at: new Date().toISOString() };
  },
};

/**
 * Canal WhatsApp Business API vía 360dialog (cambio 18). Envía el mensaje
 * renderizado por el sender compartido, que resuelve la API key del negocio. Si
 * el negocio no está conectado, el sender devuelve "no conectado" y el dispatch
 * falla sin romper la campaña.
 *
 * Nota: hoy manda el texto renderizado (válido dentro de la ventana de 24h).
 * Para campañas masivas proactivas (fuera de sesión) Meta exige un template
 * aprobado — queda como mejora cuando campañas modele su propio template.
 */
export const wabaChannel: Channel = {
  label: "WhatsApp Business API (360dialog)",
  available: true,
  async dispatch(message, businessId) {
    const res = await sendWhatsapp({
      businessId,
      to: message.customer_phone,
      text: message.rendered_message,
    });
    return res.ok
      ? { ok: true, sent_at: res.sent_at }
      : { ok: false, error: res.error };
  },
};

export function getChannel(name: CampaignChannel): Channel {
  return name === "manual" ? manualChannel : wabaChannel;
}
