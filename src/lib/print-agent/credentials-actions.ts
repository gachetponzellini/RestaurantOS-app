"use server";

import { randomBytes } from "node:crypto";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { canManageBusiness, ensureAdminAccess } from "@/lib/admin/context";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

const EXE_BUCKET = "print-agent-releases";
// Instalador de un clic (spec 046 fase 2): el objeto del bucket es un ZIP con el
// relay `print-agent.exe` + `instalar.bat` (registra el arranque automático) +
// `iniciar-agente.bat` + `LEEME.txt`. El `config.json` (key por-negocio) NO va
// adentro: se baja aparte y el usuario lo deja en la carpeta antes de instalar.
const ZIP_PATH = "print-agent.zip";

/** Key opaca del agente. `pak_live_` para reconocerla de un vistazo. */
function generateAgentKey(): string {
  return `pak_live_${randomBytes(24).toString("base64url")}`;
}

/** URL base del deploy actual (whatever host desde el que se abre el panel). */
async function currentServerUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

/**
 * Devuelve la key del negocio, creándola lazily si no existía. Server-only
 * (lo llama el instalador). Setea el flag no-sensible `print_agent_key_set`.
 */
async function ensurePrintAgentKey(businessId: string): Promise<string> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("print_agent_credentials")
    .select("api_key")
    .eq("business_id", businessId)
    .maybeSingle();
  const existing = (data as { api_key: string } | null)?.api_key;
  if (existing) return existing;

  const key = generateAgentKey();
  await service
    .from("print_agent_credentials")
    .upsert({ business_id: businessId, api_key: key }, { onConflict: "business_id" });
  await service
    .from("businesses")
    .update({ print_agent_key_set: true })
    .eq("id", businessId);
  return key;
}

/**
 * Genera el instalador del print-agent para el negocio (spec 046): el
 * `config.json` ya rellenado (con la key, creada lazily) + una signed URL del
 * `.zip` instalador (best-effort; null si el binario no está publicado). Gate
 * admin. La key sólo viaja acá, dentro de la sesión admin — nunca al cliente sin
 * gate; por eso tampoco puede ir dentro del ZIP (que es único para todos).
 */
export async function getPrintAgentInstaller(
  slug: string,
): Promise<ActionResult<{ configJson: string; zipUrl: string | null }>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctx = await ensureAdminAccess(business.id, slug);
  if (!canManageBusiness(ctx)) {
    return actionError("No tenés permisos para instalar el agente de impresión.");
  }

  const key = await ensurePrintAgentKey(business.id);
  const serverUrl = await currentServerUrl();
  const config = {
    serverUrl,
    printAgentKey: key,
    businessId: business.id,
    transport: "network",
    pollMs: 1000,
  };
  const configJson = JSON.stringify(config, null, 2) + "\n";

  // El ZIP vive en Storage (fuera de Vercel por el límite de 4.5MB). Si el
  // bucket/binario no está publicado todavía, devolvemos null y la UI lo avisa.
  let zipUrl: string | null = null;
  const service = createSupabaseServiceClient();
  const { data } = await service.storage
    .from(EXE_BUCKET)
    // `download` fuerza Content-Disposition: attachment → el browser lo baja
    // (no navega), así un <a> lo descarga sin depender de window.open.
    .createSignedUrl(ZIP_PATH, 3600, { download: "print-agent.zip" });
  zipUrl = data?.signedUrl ?? null;

  return actionOk({ configJson, zipUrl });
}

/**
 * Regenera la key del negocio (spec 046, US4): invalida la anterior. Devuelve
 * la key en claro UNA sola vez para mostrarla; nunca se vuelve a poder leer.
 * Gate admin.
 */
export async function rotatePrintAgentKey(
  slug: string,
): Promise<ActionResult<{ key: string }>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctx = await ensureAdminAccess(business.id, slug);
  if (!canManageBusiness(ctx)) {
    return actionError("No tenés permisos para regenerar la key.");
  }

  const key = generateAgentKey();
  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("print_agent_credentials")
    .upsert({ business_id: business.id, api_key: key }, { onConflict: "business_id" });
  if (error) return actionError(`Error generando la key: ${error.message}`);

  await service
    .from("businesses")
    .update({ print_agent_key_set: true })
    .eq("id", business.id);

  revalidatePath(`/${slug}/admin/configuracion/local`);
  return actionOk({ key });
}
