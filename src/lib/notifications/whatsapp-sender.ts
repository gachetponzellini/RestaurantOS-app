import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import {
  buildDialog360Payload,
  parseDialog360Response,
  type WhatsappMessageContent,
} from "./whatsapp-360dialog";
import {
  GUPSHUP_SESSION_URL,
  GUPSHUP_TEMPLATE_URL,
  buildGupshupSessionForm,
  buildGupshupTemplateForm,
  parseGupshupResponse,
} from "./whatsapp-gupshup";
import { resolveProviderTemplateId } from "./template-map";

type GenericClient = SupabaseClient;

// Endpoint del Cloud API v2 de 360dialog. Override por env si hace falta
// (sandbox). La API key identifica el canal/número — no va phone-id en la URL.
const DIALOG360_API_URL =
  process.env.DIALOG360_API_URL ?? "https://waba-v2.360dialog.io/messages";

export type WhatsappSendResult =
  | { ok: true; sent_at: string; messageId: string | null }
  | { ok: false; error: string };

export type SendWhatsappParams = {
  businessId: string;
  to: string;
  text?: string;
  template?: { name: string; lang: string; params: string[] };
};

type Creds = {
  provider: string | null;
  api_key: string | null;
  from_phone: string | null;
  app_name: string | null;
} | null;

/**
 * Lee las credenciales de WhatsApp del negocio desde `whatsapp_credentials`
 * (tabla service-role-only). La key NUNCA sale de acá hacia el cliente ni a logs.
 * El `provider` decide qué adapter usa `sendWhatsapp`.
 */
async function loadCreds(businessId: string): Promise<Creds> {
  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const { data } = await service
    .from("whatsapp_credentials")
    .select("provider, api_key, from_phone, app_name")
    .eq("business_id", businessId)
    .maybeSingle();
  return (data as Creds) ?? null;
}

/** True cuando el negocio tiene una API key de WhatsApp cargada. */
export async function isWhatsappConnected(businessId: string): Promise<boolean> {
  const creds = await loadCreds(businessId);
  return Boolean(creds?.api_key);
}

/**
 * Envía un WhatsApp para un negocio. Texto libre (sólo válido dentro de la
 * ventana de 24h) o template message (avisos proactivos). Resuelve las
 * credenciales por negocio y **despacha al adapter del proveedor** configurado
 * (`whatsapp_credentials.provider`): hoy `gupshup` (puente temporal) o
 * `360dialog`; a futuro el gateway propio GPSF. Si no hay credenciales, devuelve
 * "no conectado" sin tocar la red. Nunca lanza ni filtra la key en el error.
 */
export async function sendWhatsapp(
  params: SendWhatsappParams,
): Promise<WhatsappSendResult> {
  const creds = await loadCreds(params.businessId);
  if (!creds?.api_key) {
    return {
      ok: false,
      error:
        "WhatsApp no conectado. Cargá las credenciales del proveedor del local.",
    };
  }

  const provider = creds.provider ?? "360dialog";
  if (provider === "gupshup") {
    return sendViaGupshup(params, creds.api_key, creds);
  }
  return sendViaDialog360(params, creds.api_key);
}

/** Adapter 360dialog: payload estilo Meta Cloud API, header `D360-API-KEY`. */
async function sendViaDialog360(
  params: SendWhatsappParams,
  apiKey: string,
): Promise<WhatsappSendResult> {
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
        "D360-API-KEY": apiKey,
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

/**
 * Adapter Gupshup (PUENTE TEMPORAL): form-urlencoded, header `apikey`. Texto de
 * sesión → `/wa/api/v1/msg`; template (por UUID) → `/wa/api/v1/template/msg`.
 * `200 {status:"submitted"}` = aceptado, no entregado (los DLR son spec 039).
 */
async function sendViaGupshup(
  params: SendWhatsappParams,
  apiKey: string,
  creds: NonNullable<Creds>,
): Promise<WhatsappSendResult> {
  const source = creds.from_phone;
  const srcName = creds.app_name;
  if (!source || !srcName) {
    return {
      ok: false,
      error:
        "Falta el número o el nombre de app de Gupshup en la config del local.",
    };
  }

  let url: string;
  let form: Record<string, string>;
  if (params.template) {
    const templateId = await resolveProviderTemplateId(
      params.businessId,
      "gupshup",
      params.template.name,
      params.template.lang,
    );
    if (!templateId) {
      return {
        ok: false,
        error: `Falta el id de template de Gupshup para "${params.template.name}".`,
      };
    }
    url = GUPSHUP_TEMPLATE_URL;
    form = buildGupshupTemplateForm({
      source,
      srcName,
      to: params.to,
      templateId,
      params: params.template.params,
    });
  } else {
    url = GUPSHUP_SESSION_URL;
    form = buildGupshupSessionForm({
      source,
      srcName,
      to: params.to,
      text: params.text ?? "",
    });
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        apikey: apiKey,
      },
      body: new URLSearchParams(form).toString(),
    });
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // respuesta sin cuerpo JSON — parseGupshupResponse cae al mensaje genérico.
    }
    const parsed = parseGupshupResponse(res.status, json);
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
    return { ok: false, error: `No se pudo contactar a Gupshup: ${msg}` };
  }
}
