/**
 * Plantillas de email transaccional al cliente (spec 45) — lógica PURA.
 *
 * Cada evento produce `{ subject, html, text }`. El HTML es un layout mínimo con
 * el nombre del local; el `text` es el fallback plano. Para los estados de
 * pedido se reusa el mismo cuerpo que WhatsApp (`renderDeliveryBody`), así el
 * dueño edita una sola plantilla y sirve para ambos canales.
 */

export type CustomerEmail = { subject: string; html: string; text: string };

/** Escapa lo mínimo para no romper el HTML con datos del cliente. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function layout(input: {
  businessName: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footerNote?: string;
}): string {
  const cta = input.cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(input.cta.url)}" style="background:#111827;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">${escapeHtml(
        input.cta.label,
      )}</a></p>`
    : "";
  const footer = input.footerNote
    ? `<p style="color:#6b7280;font-size:12px;margin-top:24px">${escapeHtml(input.footerNote)}</p>`
    : "";
  return [
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827">`,
    `<h1 style="font-size:18px;margin:0 0 16px">${escapeHtml(input.businessName)}</h1>`,
    input.bodyHtml,
    cta,
    footer,
    `</div>`,
  ].join("");
}

/** Aviso de cambio de estado del pedido. `body` ya viene renderizado (delivery). */
export function orderStatusEmail(input: {
  businessName: string;
  orderNumber: number;
  body: string;
}): CustomerEmail {
  return {
    subject: `Tu pedido #${input.orderNumber} — ${input.businessName}`,
    text: input.body,
    html: layout({
      businessName: input.businessName,
      bodyHtml: `<p style="font-size:15px;line-height:1.5">${escapeHtml(input.body)}</p>`,
    }),
  };
}

/** Pedido diferido agendado tras aprobarse el pago. */
export function orderScheduledEmail(input: {
  businessName: string;
  customerName: string;
  orderNumber: number;
  whenLabel: string;
}): CustomerEmail {
  const text =
    `¡Listo ${input.customerName}! Tu pedido #${input.orderNumber} quedó agendado ` +
    `para el ${input.whenLabel}. Te avisamos cuando esté para retirar.`;
  return {
    subject: `Pedido #${input.orderNumber} agendado — ${input.businessName}`,
    text,
    html: layout({
      businessName: input.businessName,
      bodyHtml: `<p style="font-size:15px;line-height:1.5">${escapeHtml(text)}</p>`,
    }),
  };
}

/** Acuse de reserva creada. */
export function reservationConfirmedEmail(input: {
  businessName: string;
  customerName: string;
  whenLabel: string;
  partySize: number;
  manageUrl?: string;
}): CustomerEmail {
  const text =
    `¡Hola ${input.customerName}! Tu reserva en ${input.businessName} quedó confirmada ` +
    `para el ${input.whenLabel}, mesa para ${input.partySize}. ¡Te esperamos!`;
  return {
    subject: `Reserva confirmada — ${input.businessName}`,
    text,
    html: layout({
      businessName: input.businessName,
      bodyHtml: `<p style="font-size:15px;line-height:1.5">${escapeHtml(text)}</p>`,
      cta: input.manageUrl
        ? { label: "Ver mi reserva", url: input.manageUrl }
        : undefined,
    }),
  };
}

/** Recordatorio antes del turno, con link de confirmación de asistencia (opt-in). */
export function reservationReminderEmail(input: {
  businessName: string;
  customerName: string;
  whenLabel: string;
  partySize: number;
  confirmUrl?: string;
}): CustomerEmail {
  const text =
    `¡Hola ${input.customerName}! Te recordamos tu reserva en ${input.businessName} ` +
    `para el ${input.whenLabel}, mesa para ${input.partySize}. ¡Te esperamos!`;
  return {
    subject: `Recordatorio de tu reserva — ${input.businessName}`,
    text,
    html: layout({
      businessName: input.businessName,
      bodyHtml: `<p style="font-size:15px;line-height:1.5">${escapeHtml(text)}</p>`,
      cta: input.confirmUrl
        ? { label: "Confirmar asistencia", url: input.confirmUrl }
        : undefined,
      footerNote: input.confirmUrl
        ? "Si no vas a poder venir, avisanos así liberamos la mesa."
        : undefined,
    }),
  };
}

/** Comprobante fiscal emitido (AFIP/ARCA). */
export function invoiceIssuedEmail(input: {
  businessName: string;
  customerName: string;
  orderNumber: number;
  totalLabel: string;
  comprobanteLabel?: string;
}): CustomerEmail {
  const comprobante = input.comprobanteLabel
    ? ` (${input.comprobanteLabel})`
    : "";
  const text =
    `¡Gracias ${input.customerName}! Adjuntamos el comprobante de tu pedido ` +
    `#${input.orderNumber}${comprobante} por ${input.totalLabel} en ${input.businessName}.`;
  return {
    subject: `Comprobante de tu pedido #${input.orderNumber} — ${input.businessName}`,
    text,
    html: layout({
      businessName: input.businessName,
      bodyHtml: `<p style="font-size:15px;line-height:1.5">${escapeHtml(text)}</p>`,
    }),
  };
}
