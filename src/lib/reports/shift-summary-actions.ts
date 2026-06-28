"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { canHacerCorte } from "@/lib/permissions/can";
import { requireMozoActionContext } from "@/lib/mozo/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness, getBusinessSettings } from "@/lib/tenant";

import { sendShiftSummaryForBusiness } from "./send-shift-summary";

const ConfigInput = z.object({
  business_slug: z.string().min(1),
  enabled: z.boolean(),
  hour: z.number().int().min(0).max(23),
  recipients: z.array(z.string().email()).max(10),
});

/**
 * Configura el resumen de cierre del negocio (hora del cron + destinatarios).
 * Gate admin (config del negocio). Mergea en `businesses.settings`.
 */
export async function updateShiftSummaryConfig(
  input: unknown,
): Promise<ActionResult<{ slug: string }>> {
  const parsed = ConfigInput.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  }
  const { business_slug, enabled, hour, recipients } = parsed.data;

  const business = await getBusiness(business_slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  if (ctxResult.data.role !== "admin" && !ctxResult.data.isPlatformAdmin) {
    return actionError("Solo el admin puede configurar el resumen de cierre.");
  }

  const nextSettings = {
    ...getBusinessSettings(business),
    closing_summary_enabled: enabled,
    closing_summary_hour: hour,
    closing_summary_recipients: Array.from(new Set(recipients)),
  };

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("businesses")
    .update({ settings: nextSettings })
    .eq("id", business.id);
  if (error) {
    console.error("updateShiftSummaryConfig", error);
    return actionError("No pudimos guardar la configuración.");
  }

  revalidatePath(`/${business_slug}/admin/configuracion`);
  return actionOk({ slug: business_slug });
}

/**
 * "Enviar resumen ahora" (spec 34). Gate encargado/admin. Reusa la misma
 * composición que el cron, con `force` para permitir reenvío puntual del cierre
 * (el dueño decide). Best-effort: si el mail falla, devuelve el error.
 */
export async function enviarResumenAhora(
  businessSlug: string,
): Promise<ActionResult<{ recipients: number }>> {
  const business = await getBusiness(businessSlug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  if (!canHacerCorte(ctxResult.data.role)) {
    return actionError("Solo encargado o admin pueden enviar el resumen.");
  }

  const result = await sendShiftSummaryForBusiness(business.id, { force: true });
  if (!result.ok) return actionError(result.error);
  if ("skipped" in result && result.skipped) {
    return actionError("No se envió: " + result.reason);
  }
  return actionOk({ recipients: result.recipients });
}
