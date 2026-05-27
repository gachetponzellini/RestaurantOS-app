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
};

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

  const service = createSupabaseServiceClient() as unknown as SupabaseClient;
  const { error } = await service
    .from("businesses")
    .update({
      afip_cuit: cuit,
      afip_punto_venta: input.puntoVenta,
      afip_provider: input.provider,
      afip_default_tipo: input.defaultTipo,
    })
    .eq("id", business.id);

  if (error) return actionError(`Error guardando config: ${error.message}`);

  revalidatePath(`/${input.slug}/admin/configuracion`);
  revalidatePath(`/${input.slug}/admin/facturacion`);

  return actionOk({ ok: true as const });
}
