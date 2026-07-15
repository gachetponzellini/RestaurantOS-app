"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { requireMozoActionContext } from "@/lib/mozo/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

const Input = z.object({
  business_slug: z.string().min(1),
  channel: z.enum(["whatsapp", "email", "both"]),
});

/**
 * Cambia el canal de aviso transaccional al cliente del negocio (spec 45).
 * Gate admin. Escribe la columna `businesses.customer_channel`.
 */
export async function updateCustomerChannel(
  input: unknown,
): Promise<ActionResult<{ slug: string }>> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  }
  const { business_slug, channel } = parsed.data;

  const business = await getBusiness(business_slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  if (ctxResult.data.role !== "admin" && !ctxResult.data.isPlatformAdmin) {
    return actionError("Solo el admin puede cambiar el canal de avisos.");
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("businesses")
    .update({ customer_channel: channel })
    .eq("id", business.id);
  if (error) {
    console.error("updateCustomerChannel", error);
    return actionError("No pudimos guardar el canal.");
  }

  revalidatePath(`/${business_slug}/admin/configuracion/notificaciones`);
  return actionOk({ slug: business_slug });
}
