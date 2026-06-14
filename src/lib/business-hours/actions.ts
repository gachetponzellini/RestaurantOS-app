"use server";

import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { businessHoursSchema, type BusinessHourSlot } from "./schema";

async function assertCanManage(businessSlug: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "No autenticado." };

  const service = createSupabaseServiceClient();
  const { data: business } = await service
    .from("businesses")
    .select("id")
    .eq("slug", businessSlug)
    .maybeSingle();
  if (!business) return { ok: false as const, error: "Negocio no encontrado." };

  const [{ data: profile }, { data: membership }] = await Promise.all([
    service
      .from("users")
      .select("is_platform_admin")
      .eq("id", user.id)
      .maybeSingle(),
    service
      .from("business_users")
      .select("role")
      .eq("user_id", user.id)
      .eq("business_id", business.id)
      .maybeSingle(),
  ]);

  const isPlatformAdmin = profile?.is_platform_admin === true;
  const role = membership?.role;
  if (!isPlatformAdmin && role !== "admin" && role !== "encargado") {
    return { ok: false as const, error: "Sin permisos." };
  }

  return { ok: true as const, businessId: business.id };
}

export async function saveBusinessHours(
  slug: string,
  slots: BusinessHourSlot[],
): Promise<ActionResult<null>> {
  const parsed = businessHoursSchema.safeParse(slots);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Horarios inválidos.";
    return actionError(msg);
  }

  const guard = await assertCanManage(slug);
  if (!guard.ok) return actionError(guard.error);

  const service = createSupabaseServiceClient();

  const { error: deleteError } = await service
    .from("business_hours")
    .delete()
    .eq("business_id", guard.businessId);
  if (deleteError) {
    console.error("saveBusinessHours delete", deleteError);
    return actionError("Error al actualizar los horarios.");
  }

  if (parsed.data.length > 0) {
    const rows = parsed.data.map((s) => ({
      business_id: guard.businessId,
      day_of_week: s.day_of_week,
      opens_at: s.opens_at,
      closes_at: s.closes_at,
    }));
    const { error: insertError } = await service
      .from("business_hours")
      .insert(rows);
    if (insertError) {
      console.error("saveBusinessHours insert", insertError);
      return actionError("Error al guardar los horarios.");
    }
  }

  revalidatePath(`/${slug}`, "layout");
  return actionOk(null);
}
