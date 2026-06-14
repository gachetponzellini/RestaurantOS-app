/**
 * Adapter de 360dialog (lógica pura, sin red).
 *
 * 360dialog expone un proxy del WhatsApp Cloud API de Meta: el payload de
 * `/messages` es idéntico al de Meta. Acá armamos ese payload (texto o
 * template) y parseamos la respuesta a un resultado saneado. El `fetch` real y
 * la API key viven en `whatsapp-sender.ts` — este módulo nunca ve la key.
 *
 * Endpoint (lo usa el sender): POST https://waba-v2.360dialog.io/messages
 * con header `D360-API-KEY`. Confirmar contra la doc de 360dialog al cablear.
 */

export type WhatsappMessageContent =
  | { kind: "text"; body: string }
  | { kind: "template"; name: string; lang: string; params: string[] };

export type Dialog360Result =
  | { ok: true; messageId: string | null }
  | { ok: false; error: string };

/** Meta espera el número con código de país y sin `+` ni separadores. */
export function normalizeWaPhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

export function buildDialog360Payload(
  to: string,
  content: WhatsappMessageContent,
): Record<string, unknown> {
  const base = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeWaPhone(to),
  };

  if (content.kind === "text") {
    return { ...base, type: "text", text: { body: content.body } };
  }

  // template: los params van como parámetros posicionales del componente body.
  const components =
    content.params.length > 0
      ? [
          {
            type: "body",
            parameters: content.params.map((text) => ({ type: "text", text })),
          },
        ]
      : undefined;

  return {
    ...base,
    type: "template",
    template: {
      name: content.name,
      language: { code: content.lang },
      ...(components ? { components } : {}),
    },
  };
}

/**
 * Traduce la respuesta HTTP de 360dialog a un resultado saneado. Nunca incluye
 * credenciales; en error, devuelve el mensaje de Meta si viene, o uno genérico
 * con el status.
 */
export function parseDialog360Response(
  httpStatus: number,
  json: unknown,
): Dialog360Result {
  const body = (json ?? {}) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string };
    errors?: Array<{ title?: string; detail?: string }>;
  };

  if (httpStatus >= 200 && httpStatus < 300 && body.messages?.length) {
    return { ok: true, messageId: body.messages[0]?.id ?? null };
  }

  const detail =
    body.error?.message ??
    body.errors?.[0]?.detail ??
    body.errors?.[0]?.title ??
    null;
  return {
    ok: false,
    error: detail
      ? `360dialog rechazó el envío: ${detail}`
      : `360dialog rechazó el envío (HTTP ${httpStatus}).`,
  };
}
