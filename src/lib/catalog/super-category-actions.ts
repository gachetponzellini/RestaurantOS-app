"use server";

import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { SuperCategoryInput } from "./schemas";

import { requireCatalogManager } from "./require-catalog-manager";

export async function createSuperCategory(
  businessSlug: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = SuperCategoryInput.safeParse(input);
  if (!parsed.success) {
    console.error("createSuperCategory · invalid input", {
      input,
      issues: parsed.error.issues,
    });
    const first = parsed.error.issues[0];
    return actionError(
      first ? `${first.path.join(".") || "campo"}: ${first.message}` : "Datos inválidos.",
    );
  }

  const guard = await requireCatalogManager(businessSlug);
  if (!guard.ok) return guard;
  const businessId = guard.data.businessId;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("super_categories")
    .insert({ ...parsed.data, business_id: businessId })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createSuperCategory", error);
    return actionError(
      error?.code === "23505"
        ? "Ya existe una supercategoría con ese slug."
        : "No pudimos crear la supercategoría.",
    );
  }

  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk({ id: data.id });
}

export async function updateSuperCategory(
  businessSlug: string,
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = SuperCategoryInput.safeParse(input);
  if (!parsed.success) {
    console.error("updateSuperCategory · invalid input", {
      input,
      issues: parsed.error.issues,
    });
    const first = parsed.error.issues[0];
    return actionError(
      first ? `${first.path.join(".") || "campo"}: ${first.message}` : "Datos inválidos.",
    );
  }

  const guard = await requireCatalogManager(businessSlug);
  if (!guard.ok) return guard;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("super_categories")
    .update(parsed.data)
    .eq("id", id)
    .eq("business_id", guard.data.businessId);

  if (error) {
    console.error("updateSuperCategory", error);
    return actionError(
      error.code === "23505"
        ? "Ya existe una supercategoría con ese slug."
        : "No pudimos actualizar.",
    );
  }

  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk({ id });
}

export async function deleteSuperCategory(
  businessSlug: string,
  id: string,
): Promise<ActionResult<null>> {
  // El `on delete set null` en categories.super_category_id se encarga de
  // dejar las categorías huérfanas (caen al bucket "Otros" en la UI mozo).
  const guard = await requireCatalogManager(businessSlug);
  if (!guard.ok) return guard;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("super_categories")
    .delete()
    .eq("id", id)
    .eq("business_id", guard.data.businessId);
  if (error) {
    console.error("deleteSuperCategory", error);
    return actionError("No pudimos borrar la supercategoría.");
  }
  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk(null);
}

/**
 * Reordena todas las supercategorías de un business según `idsInOrder`. Cada
 * id recibe `sort_order` igual a su índice en la lista (0, 1, 2…). Usado por
 * el drag&drop de la tab Categorías.
 *
 * Validamos que `idsInOrder` cubra exactamente las supercategorías existentes
 * del business — sin extras, sin faltantes — para evitar updates parciales
 * que dejen orden inconsistente.
 */
export async function reorderSuperCategories(
  businessSlug: string,
  idsInOrder: string[],
): Promise<ActionResult<null>> {
  const guard = await requireCatalogManager(businessSlug);
  if (!guard.ok) return guard;
  const businessId = guard.data.businessId;

  const supabase = await createSupabaseServerClient();

  const { data: existing } = await supabase
    .from("super_categories")
    .select("id")
    .eq("business_id", businessId);
  if (!existing) return actionError("No pudimos leer las supercategorías.");

  const existingIds = new Set(existing.map((r) => r.id));
  const inputIds = new Set(idsInOrder);
  if (
    existingIds.size !== inputIds.size ||
    [...existingIds].some((id) => !inputIds.has(id))
  ) {
    return actionError("Lista de orden inconsistente.");
  }

  // Estrategia: dos pasos para evitar colisión con el unique index implícito
  // (no hay unique sobre sort_order pero igual evitamos negativos finales).
  // 1) Empujamos todos a un offset gigante temporal.
  // 2) Asignamos los sort_order definitivos.
  for (let i = 0; i < idsInOrder.length; i++) {
    await supabase
      .from("super_categories")
      .update({ sort_order: 100_000 + i })
      .eq("id", idsInOrder[i]!)
      .eq("business_id", businessId);
  }
  for (let i = 0; i < idsInOrder.length; i++) {
    await supabase
      .from("super_categories")
      .update({ sort_order: i })
      .eq("id", idsInOrder[i]!)
      .eq("business_id", businessId);
  }

  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk(null);
}

/**
 * Mueve una supercategoría una posición arriba o abajo dentro del business.
 * Swap con el vecino — quedó por compatibilidad con código viejo. El drag&drop
 * usa `reorderSuperCategories` (más eficiente para movimientos largos).
 */
export async function moveSuperCategory(
  businessSlug: string,
  id: string,
  direction: "up" | "down",
): Promise<ActionResult<null>> {
  const guard = await requireCatalogManager(businessSlug);
  if (!guard.ok) return guard;
  const businessId = guard.data.businessId;

  const supabase = await createSupabaseServerClient();

  const { data: list } = await supabase
    .from("super_categories")
    .select("id, sort_order")
    .eq("business_id", businessId)
    .order("sort_order");
  if (!list) return actionError("No pudimos leer las supercategorías.");

  const idx = list.findIndex((s) => s.id === id);
  if (idx < 0) return actionError("Supercategoría no encontrada.");

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) {
    // En extremo: no-op silencioso (el botón ↑/↓ debería estar deshabilitado).
    return actionOk(null);
  }

  const a = list[idx]!;
  const b = list[swapIdx]!;

  // Intermediate sort_order para evitar colisión con el unique (no hay unique
  // pero igual evitamos race con cualquier check) — usamos -1 temporal.
  await supabase
    .from("super_categories")
    .update({ sort_order: -1 })
    .eq("id", a.id)
    .eq("business_id", businessId);
  await supabase
    .from("super_categories")
    .update({ sort_order: a.sort_order })
    .eq("id", b.id)
    .eq("business_id", businessId);
  await supabase
    .from("super_categories")
    .update({ sort_order: b.sort_order })
    .eq("id", a.id)
    .eq("business_id", businessId);

  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk(null);
}
