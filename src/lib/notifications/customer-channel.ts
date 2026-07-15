/**
 * Canal de aviso transaccional al cliente (spec 45) — lógica PURA (sin DB).
 *
 * Cada negocio elige por dónde avisarle al cliente: WhatsApp, email o ambos
 * (`businesses.customer_channel`). Este puente permite operar en `email`
 * mientras WhatsApp está trabado en Meta, y volver con un flag. `pickChannels`
 * traduce el valor del negocio a qué canales despachar.
 *
 * Puro y testeable: la resolución contra la DB y el despacho viven en
 * `customer-dispatch.ts` (server-only).
 */

export type CustomerChannel = "whatsapp" | "email" | "both";

export const CUSTOMER_CHANNELS: readonly CustomerChannel[] = [
  "whatsapp",
  "email",
  "both",
] as const;

/** Default: WhatsApp → cero regresión para negocios previos a la spec 45. */
export const DEFAULT_CUSTOMER_CHANNEL: CustomerChannel = "whatsapp";

export function isCustomerChannel(value: unknown): value is CustomerChannel {
  return (
    value === "whatsapp" || value === "email" || value === "both"
  );
}

/** Normaliza el valor crudo de la columna (o null) al canal, con default seguro. */
export function normalizeCustomerChannel(
  value: string | null | undefined,
): CustomerChannel {
  return isCustomerChannel(value) ? value : DEFAULT_CUSTOMER_CHANNEL;
}

/** Qué canales despachar para el canal configurado. `both` activa los dos. */
export function pickChannels(
  channel: CustomerChannel,
): { whatsapp: boolean; email: boolean } {
  return {
    whatsapp: channel === "whatsapp" || channel === "both",
    email: channel === "email" || channel === "both",
  };
}
