import "server-only";

import {
  buildResendPayload,
  composeFrom,
  parseResendResponse,
} from "./resend-adapter";

// Endpoint del REST de Resend. Override por env por si hace falta (mock/proxy).
const RESEND_API_URL =
  process.env.RESEND_API_URL ?? "https://api.resend.com/emails";

export type EmailSendResult =
  | { ok: true; id: string | null; sent_at: string }
  | { ok: false; error: string };

export type SendEmailParams = {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  /** Nombre a mostrar en el `From` (ej. el nombre del local). La dirección sale
   *  siempre de `EMAIL_FROM` (dominio verificado del SaaS). */
  fromName?: string;
};

/**
 * Envía un email transaccional por Resend. Resuelve la API key y el `from` del
 * env del SaaS (no por negocio). **Best-effort**: nunca lanza ni filtra la key
 * en el error; si falta la key o falla la red, devuelve `{ok:false}` y la
 * operación sigue (el cierre no se rompe porque el mail no salió).
 */
export async function sendEmail(
  params: SendEmailParams,
): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;

  if (!apiKey || !emailFrom) {
    return {
      ok: false,
      error:
        "Email no configurado. Faltan RESEND_API_KEY / EMAIL_FROM en el entorno.",
    };
  }

  const recipients = params.to.map((t) => t.trim()).filter(Boolean);
  if (recipients.length === 0) {
    return { ok: false, error: "Sin destinatarios." };
  }

  const payload = buildResendPayload({
    from: composeFrom(emailFrom, params.fromName),
    to: recipients,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // respuesta sin cuerpo JSON — parseResendResponse cae al genérico.
    }
    const parsed = parseResendResponse(res.status, json);
    if (parsed.ok) {
      return { ok: true, id: parsed.id, sent_at: new Date().toISOString() };
    }
    return { ok: false, error: parsed.error };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error de red";
    return { ok: false, error: `No se pudo contactar a Resend: ${msg}` };
  }
}
