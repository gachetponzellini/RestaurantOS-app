/**
 * Adapter de Resend (lógica pura, sin red) — spec 34.
 *
 * Resend expone un REST simple: `POST https://api.resend.com/emails` con
 * `Authorization: Bearer <key>` y body `{from, to, subject, html, text}`.
 * Acá armamos ese payload y parseamos la respuesta a un resultado saneado. El
 * `fetch` real y la API key viven en `send.ts` — este módulo nunca ve la key.
 *
 * Espeja el patrón de `whatsapp-360dialog.ts` (adapter puro + sender con la
 * credencial). A diferencia de WhatsApp (credencial por negocio), el email es
 * del SaaS a los dueños: una sola key global de env.
 */

export type ResendPayloadInput = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

export type ResendResult =
  | { ok: true; id: string | null }
  | { ok: false; error: string };

export function buildResendPayload(
  input: ResendPayloadInput,
): Record<string, unknown> {
  const to = Array.isArray(input.to) ? input.to : [input.to];
  const payload: Record<string, unknown> = {
    from: input.from,
    to,
    subject: input.subject,
    html: input.html,
  };
  if (input.text) payload.text = input.text;
  return payload;
}

/**
 * Compone el header `From`. `emailFrom` puede venir como dirección pelada
 * (`noreply@pedidos.com.ar`) o como `Nombre <dir>`. Si se pasa `displayName`,
 * se reemplaza/agrega el nombre conservando la dirección — así el mail muestra
 * el nombre del local sin verificar un dominio por negocio.
 */
export function composeFrom(emailFrom: string, displayName?: string): string {
  const match = emailFrom.match(/<\s*([^>]+)\s*>/);
  const address = (match ? match[1] : emailFrom).trim();
  if (!displayName?.trim()) return emailFrom.trim();
  return `${displayName.trim()} <${address}>`;
}

/**
 * Traduce la respuesta HTTP de Resend a un resultado saneado. Nunca incluye
 * credenciales; en error devuelve el `message` de Resend si viene, o uno
 * genérico con el status.
 */
export function parseResendResponse(
  httpStatus: number,
  json: unknown,
): ResendResult {
  const body = (json ?? {}) as {
    id?: string;
    message?: string;
    name?: string;
    error?: { message?: string } | string;
  };

  if (httpStatus >= 200 && httpStatus < 300) {
    return { ok: true, id: body.id ?? null };
  }

  const detail =
    body.message ??
    (typeof body.error === "string" ? body.error : body.error?.message) ??
    body.name ??
    null;
  return {
    ok: false,
    error: detail
      ? `Resend rechazó el envío: ${detail}`
      : `Resend rechazó el envío (HTTP ${httpStatus}).`,
  };
}
