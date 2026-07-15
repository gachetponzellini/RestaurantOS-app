/**
 * Plantillas de mensajes de WhatsApp al cliente por estado de delivery.
 *
 * Lógica pura (sin DB): dado el estado destino, el tipo de pedido y los datos
 * del pedido, produce el texto a enviar — o `null` si no corresponde enviar
 * (estado no notificable, take-away en "en camino", pedido en salón, sin
 * teléfono, o plantilla deshabilitada por el dueño).
 *
 * El estado "nuevo" (el cliente cargó el pedido y el bot respondió) NO genera un
 * WhatsApp acá: esa confirmación la da el propio bot. El primer aviso de estado
 * es `preparing`. Ver proposal §6ª pregunta abierta.
 *
 * Placeholders soportados: {cliente} {numero} {negocio} {hora} (hora en
 * timezone del negocio). Dinero no aplica acá; horarios en timezone AR.
 */

import { formatInTimeZone } from "date-fns-tz";

export const DELIVERY_NOTIFY_STATUSES = [
  "preparing",
  "ready",
  "on_the_way",
  "delivered",
  "cancelled",
] as const;

export type DeliveryNotifyStatus = (typeof DELIVERY_NOTIFY_STATUSES)[number];

/** Etiquetas legibles por estado, para la UI de edición de plantillas. */
export const DELIVERY_STATUS_LABELS: Record<DeliveryNotifyStatus, string> = {
  preparing: "Preparando",
  ready: "Listo",
  on_the_way: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export function isDeliveryNotifyStatus(
  status: string,
): status is DeliveryNotifyStatus {
  return (DELIVERY_NOTIFY_STATUSES as readonly string[]).includes(status);
}

export const DEFAULT_DELIVERY_TEMPLATES: Record<DeliveryNotifyStatus, string> = {
  preparing: "¡Hola {cliente}! 👨‍🍳 Estamos preparando tu pedido #{numero}.",
  ready: "Tu pedido #{numero} ya está listo. 🙌",
  on_the_way: "Tu pedido #{numero} salió y está en camino. 🛵",
  delivered:
    "Tu pedido #{numero} fue entregado. ¡Gracias por elegir {negocio}! 🙏",
  cancelled:
    "Tu pedido #{numero} fue cancelado. Ante cualquier duda, escribinos. 🙏",
};

const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

function fillPlaceholders(
  body: string,
  vars: {
    cliente: string;
    numero: number | string;
    negocio: string;
    hora: string;
  },
): string {
  return body
    .replaceAll("{cliente}", vars.cliente)
    .replaceAll("{numero}", String(vars.numero))
    .replaceAll("{negocio}", vars.negocio)
    .replaceAll("{hora}", vars.hora);
}

/**
 * ¿Corresponde notificar este cambio de estado al cliente? Reglas AGNÓSTICAS de
 * canal (spec 45): estado notificable, salón (dine_in) no recibe, take-away sin
 * "en camino". No mira el destinatario (teléfono/email) — eso lo chequea cada
 * canal por separado.
 */
export function shouldNotifyDeliveryStatus(input: {
  status: string;
  deliveryType: string;
}): input is { status: DeliveryNotifyStatus; deliveryType: string } {
  if (!isDeliveryNotifyStatus(input.status)) return false;
  if (input.deliveryType === "dine_in") return false;
  if (input.status === "on_the_way" && input.deliveryType !== "delivery") {
    return false;
  }
  return true;
}

/**
 * Texto del aviso de estado, SIN chequear el destinatario. Devuelve `null` si el
 * estado no corresponde (supresión agnóstica) o la plantilla está apagada. Sirve
 * para cualquier canal (WhatsApp o email).
 */
export function renderDeliveryBody(input: {
  status: string;
  deliveryType: string;
  customerName: string;
  orderNumber: number;
  businessName: string;
  template?: { body: string; enabled: boolean } | null;
  timezone?: string;
  now?: Date;
}): string | null {
  if (!shouldNotifyDeliveryStatus(input)) return null;

  // Plantilla explícitamente deshabilitada por el dueño → no se envía.
  if (input.template && !input.template.enabled) return null;

  const body =
    input.template?.body?.trim() || DEFAULT_DELIVERY_TEMPLATES[input.status];

  const tz = input.timezone || DEFAULT_TZ;
  const hora = formatInTimeZone(input.now ?? new Date(), tz, "HH:mm");

  return fillPlaceholders(body, {
    cliente: input.customerName,
    numero: input.orderNumber,
    negocio: input.businessName,
    hora,
  });
}

export function renderDeliveryMessage(input: {
  status: string;
  /** 'delivery' | 'pickup' | 'dine_in' */
  deliveryType: string;
  customerName: string;
  customerPhone: string | null;
  orderNumber: number;
  businessName: string;
  template?: { body: string; enabled: boolean } | null;
  timezone?: string;
  now?: Date;
}): string | null {
  // Canal WhatsApp: sin teléfono válido no hay a quién mandarle.
  if (!input.customerPhone || input.customerPhone.trim().length === 0) {
    return null;
  }
  return renderDeliveryBody(input);
}
