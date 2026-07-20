"use server";

import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { CategoryInput } from "./schemas";

import { requireCatalogManager } from "./require-catalog-manager";

export async function createCategory(
  businessSlug: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = CategoryInput.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");

  const guard = await requireCatalogManager(businessSlug);
  if (!guard.ok) return guard;
  const businessId = guard.data.businessId;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("categories")
    .insert({ ...parsed.data, business_id: businessId })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createCategory", error);
    return actionError(
      error?.code === "23505"
        ? "Ya existe una categoría con ese slug."
        : "No pudimos crear la categoría.",
    );
  }
  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk({ id: data.id });
}

export async function updateCategory(
  businessSlug: string,
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = CategoryInput.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");

  const guard = await requireCatalogManager(businessSlug);
  if (!guard.ok) return guard;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("categories")
    .update(parsed.data)
    .eq("id", id)
    .eq("business_id", guard.data.businessId);
  if (error) {
    console.error("updateCategory", error);
    return actionError(
      error.code === "23505"
        ? "Ya existe una categoría con ese slug."
        : "No pudimos actualizar.",
    );
  }
  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk({ id });
}

export async function deleteCategory(
  businessSlug: string,
  id: string,
): Promise<ActionResult<null>> {
  const guard = await requireCatalogManager(businessSlug);
  if (!guard.ok) return guard;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("business_id", guard.data.businessId);
  if (error) {
    console.error("deleteCategory", error);
    return actionError("No pudimos borrar la categoría.");
  }
  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk(null);
}

/**
 * Asignar una categoría a una supercategoría (o desasignar con null). Action
 * dedicada — más simple que el `updateCategory` completo y deja libre al UI
 * para reasignar desde una lista sin recargar el form entero.
 */
export async function assignCategoryToSuper(
  businessSlug: string,
  categoryId: string,
  superCategoryId: string | null,
): Promise<ActionResult<null>> {
  const guard = await requireCatalogManager(businessSlug);
  if (!guard.ok) return guard;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("categories")
    .update({ super_category_id: superCategoryId })
    .eq("id", categoryId)
    .eq("business_id", guard.data.businessId);
  if (error) {
    console.error("assignCategoryToSuper", error);
    return actionError("No pudimos cambiar la supercategoría.");
  }
  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk(null);
}

/**
 * Reordena las categorías de un scope (mismo business + misma super, o
 * huérfanas si `superCategoryId` es null). Asigna `sort_order = idx` a cada
 * id según el orden recibido. Usado por el drag&drop de la tab Categorías.
 *
 * Valida que los ids cubran exactamente las categorías existentes del scope
 * para evitar updates parciales que dejen orden inconsistente.
 */
export async function reorderCategories(
  businessSlug: string,
  superCategoryId: string | null,
  idsInOrder: string[],
): Promise<ActionResult<null>> {
  const guard = await requireCatalogManager(businessSlug);
  if (!guard.ok) return guard;
  const businessId = guard.data.businessId;

  const supabase = await createSupabaseServerClient();

  const baseQuery = supabase
    .from("categories")
    .select("id")
    .eq("business_id", businessId);
  const { data: existing } = superCategoryId
    ? await baseQuery.eq("super_category_id", superCategoryId)
    : await baseQuery.is("super_category_id", null);
  if (!existing) return actionError("No pudimos leer las categorías.");

  const existingIds = new Set(existing.map((r) => r.id));
  const inputIds = new Set(idsInOrder);
  if (
    existingIds.size !== inputIds.size ||
    [...existingIds].some((id) => !inputIds.has(id))
  ) {
    return actionError("Lista de orden inconsistente.");
  }

  for (let i = 0; i < idsInOrder.length; i++) {
    await supabase
      .from("categories")
      .update({ sort_order: 100_000 + i })
      .eq("id", idsInOrder[i]!)
      .eq("business_id", businessId);
  }
  for (let i = 0; i < idsInOrder.length; i++) {
    await supabase
      .from("categories")
      .update({ sort_order: i })
      .eq("id", idsInOrder[i]!)
      .eq("business_id", businessId);
  }

  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk(null);
}

/**
 * Mueve una categoría una posición arriba o abajo. Quedó por compatibilidad
 * — el drag&drop usa `reorderCategories`.
 */
export async function moveCategory(
  businessSlug: string,
  id: string,
  direction: "up" | "down",
): Promise<ActionResult<null>> {
  const guard = await requireCatalogManager(businessSlug);
  if (!guard.ok) return guard;
  const businessId = guard.data.businessId;

  const supabase = await createSupabaseServerClient();

  const { data: target } = await supabase
    .from("categories")
    .select("id, super_category_id")
    .eq("id", id)
    .maybeSingle();
  if (!target) return actionError("Categoría no encontrada.");

  // Cargamos solo las hermanas dentro del mismo super (o sin super).
  const sameSuperQuery = supabase
    .from("categories")
    .select("id, sort_order")
    .eq("business_id", businessId)
    .order("sort_order");
  const { data: list } = target.super_category_id
    ? await sameSuperQuery.eq("super_category_id", target.super_category_id)
    : await sameSuperQuery.is("super_category_id", null);
  if (!list) return actionError("No pudimos leer las categorías.");

  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return actionError("Categoría no encontrada.");

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) {
    return actionOk(null);
  }

  const a = list[idx]!;
  const b = list[swapIdx]!;

  await supabase
    .from("categories")
    .update({ sort_order: -1 })
    .eq("id", a.id)
    .eq("business_id", businessId);
  await supabase
    .from("categories")
    .update({ sort_order: a.sort_order })
    .eq("id", b.id)
    .eq("business_id", businessId);
  await supabase
    .from("categories")
    .update({ sort_order: b.sort_order })
    .eq("id", a.id)
    .eq("business_id", businessId);

  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk(null);
}
