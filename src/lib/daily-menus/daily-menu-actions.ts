"use server";

import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { DailyMenuInput, type DailyMenuComponentInput } from "./schemas";

async function getBusinessIdBySlug(slug: string): Promise<string | null> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("businesses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Sincroniza los componentes de un menú comparando los incoming contra los
 * que ya están en DB. Inserta los nuevos (sin id), actualiza los existentes
 * (con id) y borra los que desaparecieron. Mismo pattern que
 * `syncModifierGroups` en [src/lib/catalog/product-actions.ts].
 */
async function syncComponents(
  menuId: string,
  components: DailyMenuComponentInput[],
): Promise<string | null> {
  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("daily_menu_components")
    .select("id")
    .eq("menu_id", menuId);
  const existingIds = new Set((existing ?? []).map((c) => c.id));
  const incomingIds = new Set(
    components.map((c) => c.id).filter((id): id is string => !!id),
  );
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("daily_menu_components")
      .delete()
      .in("id", toDelete);
    if (error) return "No pudimos borrar componentes viejos.";
  }

  for (const [idx, component] of components.entries()) {
    const payload = {
      menu_id: menuId,
      label: component.label,
      description: component.description ?? null,
      sort_order: idx,
      kind: component.kind ?? "text",
      product_id: component.product_id ?? null,
      choice_group_id: component.choice_group_id ?? null,
      choice_group_label: component.choice_group_label ?? null,
    };
    if (component.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase
        .from("daily_menu_components")
        .update(payload as any)
        .eq("id", component.id);
      if (error) return "No pudimos actualizar un componente.";
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase
        .from("daily_menu_components")
        .insert(payload as any);
      if (error) return "No pudimos crear un componente.";
    }
  }
  return null;
}

export async function createDailyMenu(
  businessSlug: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = DailyMenuInput.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");

  const businessId = await getBusinessIdBySlug(businessSlug);
  if (!businessId) return actionError("Negocio no encontrado.");

  const supabase = await createSupabaseServerClient();
  const { components, ...menuData } = parsed.data;
  const { data, error } = await supabase
    .from("daily_menus")
    .insert({ ...menuData, business_id: businessId })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createDailyMenu", error);
    return actionError(
      error?.code === "23505"
        ? "Ya existe un menú con ese slug."
        : "No pudimos crear el menú.",
    );
  }
  const err = await syncComponents(data.id, components);
  if (err) return actionError(err);
  revalidatePath(`/${businessSlug}/admin/menu-del-dia`);
  revalidatePath(`/${businessSlug}/menu`);
  return actionOk({ id: data.id });
}

export async function updateDailyMenu(
  businessSlug: string,
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = DailyMenuInput.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");

  const businessId = await getBusinessIdBySlug(businessSlug);
  if (!businessId) return actionError("Negocio no encontrado.");

  const supabase = await createSupabaseServerClient();
  const { components, ...menuData } = parsed.data;
  const { error } = await supabase
    .from("daily_menus")
    .update(menuData)
    .eq("id", id);
  if (error) {
    console.error("updateDailyMenu", error);
    return actionError(
      error.code === "23505"
        ? "Ya existe un menú con ese slug."
        : "No pudimos actualizar el menú.",
    );
  }
  const err = await syncComponents(id, components);
  if (err) return actionError(err);
  revalidatePath(`/${businessSlug}/admin/menu-del-dia`);
  revalidatePath(`/${businessSlug}/menu`);
  return actionOk({ id });
}

export async function deleteDailyMenu(
  businessSlug: string,
  id: string,
): Promise<ActionResult<null>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("daily_menus").delete().eq("id", id);
  if (error) {
    console.error("deleteDailyMenu", error);
    return actionError("No pudimos borrar el menú.");
  }
  revalidatePath(`/${businessSlug}/admin/menu-del-dia`);
  revalidatePath(`/${businessSlug}/menu`);
  return actionOk(null);
}

export async function toggleDailyMenuActive(
  businessSlug: string,
  id: string,
  isActive: boolean,
): Promise<ActionResult<{ is_active: boolean }>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("daily_menus")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) {
    console.error("toggleDailyMenuActive", error);
    return actionError("No pudimos actualizar.");
  }
  revalidatePath(`/${businessSlug}/admin/menu-del-dia`);
  revalidatePath(`/${businessSlug}/menu`);
  return actionOk({ is_active: isActive });
}

export async function toggleDailyMenuAvailability(
  businessSlug: string,
  id: string,
  isAvailable: boolean,
): Promise<ActionResult<{ is_available: boolean }>> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("daily_menus")
    .update({ is_available: isAvailable })
    .eq("id", id);
  if (error) {
    console.error("toggleDailyMenuAvailability", error);
    return actionError("No pudimos actualizar.");
  }
  revalidatePath(`/${businessSlug}/admin/menu-del-dia`);
  revalidatePath(`/${businessSlug}/menu`);
  return actionOk({ is_available: isAvailable });
}
