"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { canConfigureReservations } from "@/lib/permissions/can";
import { getReservationActor } from "@/lib/reservations/queries";
import { ReservationSettingsInputSchema } from "@/lib/reservations/schema";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type GenericClient = SupabaseClient;

/**
 * Autoriza configurar el motor de reservas (horarios/buffer/etc.):
 * admin/encargado o platform admin (spec 22). El mozo gestiona reservas pero
 * no cambia las reglas.
 */
async function assertCanConfigure(businessSlug: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "No autenticado." };

  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const { data: business } = await service
    .from("businesses")
    .select("id")
    .eq("slug", businessSlug)
    .maybeSingle();
  if (!business) return { ok: false as const, error: "Negocio no encontrado." };

  const businessId = (business as { id: string }).id;
  const { role, isPlatformAdmin } = await getReservationActor(businessId, user.id);
  if (!isPlatformAdmin && !canConfigureReservations(role)) {
    return { ok: false as const, error: "Permiso denegado." };
  }
  return { ok: true as const, businessId };
}

export async function saveReservationSettings(input: unknown): Promise<ActionResult<null>> {
  const parsed = ReservationSettingsInputSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  }
  const guard = await assertCanConfigure(parsed.data.business_slug);
  if (!guard.ok) return actionError(guard.error);

  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const { error } = await service.from("reservation_settings").upsert(
    {
      business_id: guard.businessId,
      slot_duration_min: parsed.data.slot_duration_min,
      buffer_min: parsed.data.buffer_min,
      lead_time_min: parsed.data.lead_time_min,
      advance_days_max: parsed.data.advance_days_max,
      max_party_size: parsed.data.max_party_size,
      no_show_grace_min: parsed.data.no_show_grace_min,
      schedule: parsed.data.schedule,
    },
    { onConflict: "business_id" },
  );
  if (error) {
    console.error("saveReservationSettings", error);
    return actionError("No pudimos guardar la configuración.");
  }

  revalidatePath(`/${parsed.data.business_slug}/admin/reservas/configuracion`);
  revalidatePath(`/${parsed.data.business_slug}/admin/reservas`);
  revalidatePath(`/${parsed.data.business_slug}/reservar`);
  return actionOk(null);
}
