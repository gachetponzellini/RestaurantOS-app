import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import {
  buildDialog360Payload,
  parseDialog360Response,
  type WhatsappMessageContent,
} from "./whatsapp-360dialog";

type GenericClient = SupabaseClient;

// Endpoint del Cloud API v2 de 360dialog. Override por env si hace falta
// (sandbox). La API key identifica el canal/número — no va phone-id en la URL.
const DIALOG360_API_URL =
  process.env.DIALOG360_API_URL ?? "https://waba-v2.360dialog.io/messages";

export type WhatsappSendResult =
  | { ok: true; sent_at: string; messageId: string | null }
  | { ok: false; error: string };

type Creds = { api_key: string | null; from_phone: string | null } | null;

/**
 * Lee las credenciales de 360dialog del negocio desde `whatsapp_credentials`
 * (tabla service-role-only). La key NUNCA sale de acá hacia el cliente ni a logs.
 */
async function loadCreds(businessId: string): Promise<Creds> {
  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const { data } = await service
    .from("whatsapp_credentials")
    .select("api_key, from_phone")
    .eq("business_id", businessId)
    .maybeSingle();
  return (data as Creds) ?? null;
}

/** True cuando el negocio tiene una API key de 360dialog cargada. */
export async function isWhatsappConnected(businessId: string): Promise<boolean> {
  const creds = await loadCreds(businessId);
  return Boolean(creds?.api_key);
}

/**
 * Envía un WhatsApp por 360dialog para un negocio. Texto libre (sólo válido
 * dentro de la ventana de 24h) o template message (avisos proactivos). Resuelve
 * las credenciales por negocio; si no hay, devuelve "no conectado" sin tocar la
 * red. Nunca lanza ni filtra la key en el error.
 */
export async function sendWhatsapp(params: {
  businessId: string;
  to: string;
  text?: string;
  template?: { name: string; lang: string; params: string[] };
}): Promise<WhatsappSendResult> {
  const creds = await loadCreds(params.businessId);
  if (!creds?.api_key) {
    return {
      ok: false,
      error:
        "WhatsApp no conectado. Cargá las credenciales de 360dialog del local.",
    };
  }

  const content: WhatsappMessageContent = params.template
    ? {
        kind: "template",
        name: params.template.name,
        lang: params.template.lang,
        params: params.template.params,
      }
    : { kind: "text", body: params.text ?? "" };

  const payload = buildDialog360Payload(params.to, content);

  try {
    const res = await fetch(DIALOG360_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "D360-API-KEY": creds.api_key,
      },
      body: JSON.stringify(payload),
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // respuesta sin cuerpo JSON — parseResponse cae al mensaje genérico.
    }
    const parsed = parseDialog360Response(res.status, json);
    if (parsed.ok) {
      return {
        ok: true,
        sent_at: new Date().toISOString(),
        messageId: parsed.messageId,
      };
    }
    return { ok: false, error: parsed.error };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error de red";
    return { ok: false, error: `No se pudo contactar a 360dialog: ${msg}` };
  }
}
