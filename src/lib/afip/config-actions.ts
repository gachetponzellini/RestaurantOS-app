"use server";

import { revalidatePath } from "next/cache";

import type { SupabaseClient } from "@supabase/supabase-js";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { canManageBusiness, ensureAdminAccess } from "@/lib/admin/context";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

import type { AFIPProvider, TipoComprobante } from "./types";

type UpdateAfipConfigInput = {
  slug: string;
  cuit: string;
  puntoVenta: number;
  provider: AFIPProvider;
  defaultTipo: TipoComprobante;
  /**
   * Credenciales del provider (TusFacturas). Sólo se persisten si vienen con
   * valor: la UI no las pre-rellena, así que un guardado sin tocar estos campos
   * NO pisa las credenciales ya cargadas.
   */
  apiToken?: string;
  apiKey?: string;
  userToken?: string;
};

function revalidateAfip(slug: string) {
  revalidatePath(`/${slug}/admin/configuracion`);
  revalidatePath(`/${slug}/admin/facturacion`);
}

export async function updateAfipConfig(
  input: UpdateAfipConfigInput,
): Promise<ActionResult<{ ok: true }>> {
  const business = await getBusiness(input.slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctx = await ensureAdminAccess(business.id, input.slug);
  if (!canManageBusiness(ctx)) {
    return actionError("No tenés permisos para modificar la configuración AFIP.");
  }

  const cuit = input.cuit.replace(/\D/g, "");
  if (cuit.length !== 11) {
    return actionError("El CUIT debe tener 11 dígitos.");
  }
  if (input.puntoVenta < 1 || input.puntoVenta > 99999) {
    return actionError("Punto de venta inválido.");
  }

  const update: Record<string, unknown> = {
    afip_cuit: cuit,
    afip_punto_venta: input.puntoVenta,
    afip_provider: input.provider,
    afip_default_tipo: input.defaultTipo,
  };

  // Persistir credenciales sólo si vienen con valor (server-only).
  const apiToken = input.apiToken?.trim();
  const apiKey = input.apiKey?.trim();
  const userToken = input.userToken?.trim();
  if (apiToken) update.afip_provider_api_token = apiToken;
  if (apiKey) update.afip_provider_api_key = apiKey;
  if (userToken) update.afip_provider_user_token = userToken;

  const service = createSupabaseServiceClient() as unknown as SupabaseClient;
  const { error } = await service
    .from("businesses")
    .update(update)
    .eq("id", business.id);

  if (error) return actionError(`Error guardando config: ${error.message}`);

  revalidateAfip(input.slug);

  // Nunca devolvemos las credenciales en la respuesta.
  return actionOk({ ok: true as const });
}

/**
 * Promueve el negocio de `sandbox` a `producción`. Requiere las tres
 * credenciales reales cargadas; si faltan, bloquea y deja el modo en sandbox.
 */
export async function promoteAfipToProduction(
  slug: string,
): Promise<ActionResult<{ ok: true }>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctx = await ensureAdminAccess(business.id, slug);
  if (!canManageBusiness(ctx)) {
    return actionError("No tenés permisos para modificar la configuración AFIP.");
  }

  const service = createSupabaseServiceClient() as unknown as SupabaseClient;
  const { data } = await service
    .from("businesses")
    .select(
      "afip_provider_api_token, afip_provider_api_key, afip_provider_user_token",
    )
    .eq("id", business.id)
    .single();

  const row = data as {
    afip_provider_api_token: string | null;
    afip_provider_api_key: string | null;
    afip_provider_user_token: string | null;
  } | null;

  const hasCreds =
    row?.afip_provider_api_token &&
    row?.afip_provider_api_key &&
    row?.afip_provider_user_token;
  if (!hasCreds) {
    return actionError(
      "Cargá las credenciales reales antes de pasar a producción.",
    );
  }

  const { error } = await service
    .from("businesses")
    .update({ afip_mode: "produccion", afip_enabled: true })
    .eq("id", business.id);
  if (error) return actionError(`Error promoviendo a producción: ${error.message}`);

  revalidateAfip(slug);
  return actionOk({ ok: true as const });
}

/** Vuelve el negocio a `sandbox` (deshabilita la emisión productiva). */
export async function revertAfipToSandbox(
  slug: string,
): Promise<ActionResult<{ ok: true }>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctx = await ensureAdminAccess(business.id, slug);
  if (!canManageBusiness(ctx)) {
    return actionError("No tenés permisos para modificar la configuración AFIP.");
  }

  const service = createSupabaseServiceClient() as unknown as SupabaseClient;
  const { error } = await service
    .from("businesses")
    .update({ afip_mode: "sandbox", afip_enabled: false })
    .eq("id", business.id);
  if (error) return actionError(`Error volviendo a sandbox: ${error.message}`);

  revalidateAfip(slug);
  return actionOk({ ok: true as const });
}
