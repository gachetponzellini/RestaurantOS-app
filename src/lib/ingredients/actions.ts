"use server";

import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import {
  IngredientInput,
  IngredientRecipeLineInput,
  PresentationInput,
  RecipeLineInput,
  StockAjusteInput,
  StockIngresoInput,
} from "./schema";
import type { IngredientRecipeLine, IngredientUnit } from "./types";

// ── Helpers ──────────────────────────────────────────────────────

async function getBusinessIdBySlug(slug: string): Promise<string | null> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("businesses")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  return data?.id ?? null;
}

function db() {
  return createSupabaseServiceClient();
}

async function authDb() {
  return createSupabaseServerClient();
}

// ═══════════════════════════════════════════════════════════════════
// INGREDIENTS (INSUMOS)
// ═══════════════════════════════════════════════════════════════════

export async function createIngredient(
  businessSlug: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = IngredientInput.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");

  const businessId = await getBusinessIdBySlug(businessSlug);
  if (!businessId) return actionError("Negocio no encontrado.");

  const supabase = await authDb();
  const { data, error } = await supabase
    .from("ingredients")
    .insert({ ...parsed.data, business_id: businessId })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createIngredient", error);
    return actionError(
      error?.code === "23505"
        ? "Ya existe un ingrediente con ese nombre."
        : "No pudimos crear el ingrediente.",
    );
  }
  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk({ id: data.id });
}

export async function updateIngredient(
  businessSlug: string,
  id: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = IngredientInput.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");

  const supabase = await authDb();
  const { error } = await supabase
    .from("ingredients")
    .update(parsed.data)
    .eq("id", id);

  if (error) {
    console.error("updateIngredient", error);
    return actionError(
      error.code === "23505"
        ? "Ya existe un ingrediente con ese nombre."
        : "No pudimos actualizar.",
    );
  }
  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk({ id });
}

export async function deleteIngredient(
  businessSlug: string,
  id: string,
): Promise<ActionResult<null>> {
  const supabase = await authDb();
  const { error } = await supabase.from("ingredients").delete().eq("id", id);
  if (error) {
    console.error("deleteIngredient", error);
    return actionError(
      error.code === "23503"
        ? "No se puede borrar: el ingrediente está usado en recetas."
        : "No pudimos borrar el ingrediente.",
    );
  }
  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk(null);
}

// ═══════════════════════════════════════════════════════════════════
// PRESENTATIONS (ENVASES)
// ═══════════════════════════════════════════════════════════════════

export async function upsertPresentations(
  businessSlug: string,
  ingredientId: string,
  inputs: unknown[],
): Promise<ActionResult<null>> {
  const parsed = inputs.map((i) => PresentationInput.safeParse(i));
  if (parsed.some((p) => !p.success)) return actionError("Datos inválidos.");
  const items = parsed.map((p) => p.data!);

  // Validate: exactly one default
  const defaults = items.filter((i) => i.is_default);
  if (defaults.length !== 1) {
    return actionError("Debe haber exactamente una presentación por defecto.");
  }

  const businessId = await getBusinessIdBySlug(businessSlug);
  if (!businessId) return actionError("Negocio no encontrado.");

  const service = db();

  // Verify ingredient belongs to this business
  const { data: ing } = await service
    .from("ingredients")
    .select("id")
    .eq("id", ingredientId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!ing) return actionError("Ingrediente no encontrado.");

  // Get existing presentations
  const { data: existing } = await service
    .from("ingredient_presentations")
    .select("id")
    .eq("ingredient_id", ingredientId);
  const existingIds = new Set<string>((existing ?? []).map((e: any) => e.id as string));

  // Split into updates vs inserts
  const toUpdate = items.filter((i) => i.id && existingIds.has(i.id));
  const toInsert = items.filter((i) => !i.id || !existingIds.has(i.id));
  const incomingIds = new Set<string>(items.filter((i) => i.id).map((i) => i.id!));
  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));

  // Execute all operations
  for (const item of toDelete) {
    await service.from("ingredient_presentations").delete().eq("id", item);
  }
  for (const item of toUpdate) {
    const { id, ...rest } = item;
    await service
      .from("ingredient_presentations")
      .update(rest)
      .eq("id", id!);
  }
  if (toInsert.length > 0) {
    await service.from("ingredient_presentations").insert(
      toInsert.map(({ id: _id, ...rest }) => ({
        ...rest,
        ingredient_id: ingredientId,
      })),
    );
  }

  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk(null);
}

// ═══════════════════════════════════════════════════════════════════
// RECIPES (RECETAS)
// ═══════════════════════════════════════════════════════════════════

export async function saveRecipe(
  businessSlug: string,
  productId: string,
  lines: unknown[],
): Promise<ActionResult<null>> {
  const parsed = lines.map((l) => RecipeLineInput.safeParse(l));
  if (parsed.some((p) => !p.success)) return actionError("Datos inválidos.");
  const items = parsed.map((p) => p.data!);

  // Check for duplicate ingredients
  const ingredientIds = items.map((i) => i.ingredient_id);
  if (new Set(ingredientIds).size !== ingredientIds.length) {
    return actionError("No se puede repetir un ingrediente en la misma receta.");
  }

  const service = db();

  // Verify product belongs to business
  const businessId = await getBusinessIdBySlug(businessSlug);
  if (!businessId) return actionError("Negocio no encontrado.");

  const { data: product } = await service
    .from("products")
    .select("id, business_id")
    .eq("id", productId)
    .maybeSingle();
  if (!product || product.business_id !== businessId) {
    return actionError("Producto no encontrado.");
  }

  // Replace all recipe lines atomically: delete old + insert new
  await service.from("recipes").delete().eq("product_id", productId);

  if (items.length > 0) {
    const { error } = await service.from("recipes").insert(
      items.map((item: any) => ({
        product_id: productId,
        ingredient_id: item.ingredient_id,
        quantity: item.quantity,
        notes: item.notes?.trim() || null,
      })),
    );
    if (error) {
      console.error("saveRecipe", error);
      return actionError("No pudimos guardar la receta.");
    }
  }

  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk(null);
}

export async function removeRecipeLine(
  businessSlug: string,
  recipeLineId: string,
): Promise<ActionResult<null>> {
  const supabase = await authDb();
  const { error } = await supabase.from("recipes").delete().eq("id", recipeLineId);
  if (error) {
    console.error("removeRecipeLine", error);
    return actionError("No pudimos borrar la línea de receta.");
  }
  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk(null);
}

// ═══════════════════════════════════════════════════════════════════
// SUB-RECIPES (INGREDIENTES COMPUESTOS)
// ═══════════════════════════════════════════════════════════════════

/** Save (replace) the sub-recipe for a composite ingredient. */
export async function saveIngredientRecipe(
  businessSlug: string,
  ingredientId: string,
  lines: unknown[],
): Promise<ActionResult<null>> {
  const parsed = lines.map((l) => IngredientRecipeLineInput.safeParse(l));
  if (parsed.some((p) => !p.success)) return actionError("Datos inválidos.");
  const items = parsed.map((p) => p.data!);

  // Check for duplicate child ingredients
  const childIds = items.map((i) => i.child_ingredient_id);
  if (new Set(childIds).size !== childIds.length) {
    return actionError("No se puede repetir un ingrediente en la misma sub-receta.");
  }

  // Check no self-reference
  if (childIds.includes(ingredientId)) {
    return actionError("Un ingrediente no puede incluirse a sí mismo.");
  }

  const businessId = await getBusinessIdBySlug(businessSlug);
  if (!businessId) return actionError("Negocio no encontrado.");

  const service = db();

  // Verify ingredient belongs to business and is composite
  const { data: ing } = await service
    .from("ingredients")
    .select("id, business_id, is_composite")
    .eq("id", ingredientId)
    .maybeSingle();
  if (!ing || ing.business_id !== businessId) {
    return actionError("Ingrediente no encontrado.");
  }
  if (!ing.is_composite) {
    return actionError("El ingrediente no está marcado como compuesto.");
  }

  // Basic cycle detection: check that none of the children (if composite)
  // eventually reference this ingredient as a descendant.
  for (const item of items) {
    const hasCycle = await detectCycle(service, item.child_ingredient_id, ingredientId);
    if (hasCycle) {
      return actionError(
        "Referencia circular detectada: un sub-ingrediente ya contiene a este ingrediente.",
      );
    }
  }

  // Replace all sub-recipe lines atomically: delete old + insert new
  await service
    .from("ingredient_recipes")
    .delete()
    .eq("parent_ingredient_id", ingredientId);

  if (items.length > 0) {
    const { error } = await service.from("ingredient_recipes").insert(
      items.map((item) => ({
        parent_ingredient_id: ingredientId,
        child_ingredient_id: item.child_ingredient_id,
        quantity: item.quantity,
        notes: item.notes?.trim() || null,
      })),
    );
    if (error) {
      console.error("saveIngredientRecipe", error);
      return actionError("No pudimos guardar la sub-receta.");
    }
  }

  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk(null);
}

export async function removeIngredientRecipeLine(
  businessSlug: string,
  lineId: string,
): Promise<ActionResult<null>> {
  const supabase = await authDb();
  const { error } = await supabase
    .from("ingredient_recipes")
    .delete()
    .eq("id", lineId);
  if (error) {
    console.error("removeIngredientRecipeLine", error);
    return actionError("No pudimos borrar la línea de sub-receta.");
  }
  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk(null);
}

/**
 * Walk the sub-recipe tree from `startId` looking for `targetId`.
 * Returns true if adding targetId as a parent of startId would create a cycle.
 */
async function detectCycle(
  service: ReturnType<typeof db>,
  startId: string,
  targetId: string,
  visited: Set<string> = new Set(),
): Promise<boolean> {
  if (startId === targetId) return true;
  if (visited.has(startId)) return false;
  visited.add(startId);

  const { data: children } = await service
    .from("ingredient_recipes")
    .select("child_ingredient_id")
    .eq("parent_ingredient_id", startId);

  if (!children || children.length === 0) return false;

  for (const child of children) {
    if (await detectCycle(service, child.child_ingredient_id, targetId, visited)) {
      return true;
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════════
// STOCK DE COCINA
// ═══════════════════════════════════════════════════════════════════

export async function ingresarStockCocina(
  businessSlug: string,
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = StockIngresoInput.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");

  const businessId = await getBusinessIdBySlug(businessSlug);
  if (!businessId) return actionError("Negocio no encontrado.");

  const service = db();

  // Get the presentation to know the net_quantity
  const { data: pres } = await service
    .from("ingredient_presentations")
    .select("id, net_quantity, ingredient_id")
    .eq("id", parsed.data.presentation_id)
    .maybeSingle();
  if (!pres || pres.ingredient_id !== parsed.data.ingredient_id) {
    return actionError("Presentación no encontrada.");
  }

  // Verify ingredient belongs to business
  const { data: ing } = await service
    .from("ingredients")
    .select("id, business_id")
    .eq("id", parsed.data.ingredient_id)
    .maybeSingle();
  if (!ing || ing.business_id !== businessId) {
    return actionError("Ingrediente no encontrado.");
  }

  // Calculate total base units: units × net_quantity
  const totalBaseUnits = parsed.data.units * Number(pres.net_quantity);

  // Read current stock and add
  const { data: current } = await service
    .from("ingredients")
    .select("stock_quantity")
    .eq("id", parsed.data.ingredient_id)
    .single();
  if (!current) return actionError("Error al leer stock.");

  await service
    .from("ingredients")
    .update({ stock_quantity: Number(current.stock_quantity) + totalBaseUnits })
    .eq("id", parsed.data.ingredient_id);

  // Log stock entry as 'compra' consumption
  await service.from("ingredient_consumptions").insert({
    business_id: businessId,
    ingredient_id: parsed.data.ingredient_id,
    quantity: totalBaseUnits,
    cost_cents_snapshot: 0,
    kind: "compra",
  });

  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk(null);
}

export async function ajustarStockCocina(
  businessSlug: string,
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = StockAjusteInput.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");

  const businessId = await getBusinessIdBySlug(businessSlug);
  if (!businessId) return actionError("Negocio no encontrado.");

  const service = db();

  // Verify ingredient belongs to business
  const { data: ing } = await service
    .from("ingredients")
    .select("id, business_id, stock_quantity")
    .eq("id", parsed.data.ingredient_id)
    .maybeSingle();
  if (!ing || ing.business_id !== businessId) {
    return actionError("Ingrediente no encontrado.");
  }

  const newQty = Number(ing.stock_quantity) + parsed.data.quantity;

  await service
    .from("ingredients")
    .update({ stock_quantity: newQty })
    .eq("id", parsed.data.ingredient_id);

  // Log adjustment in consumption log
  await service.from("ingredient_consumptions").insert({
    business_id: businessId,
    ingredient_id: parsed.data.ingredient_id,
    quantity: Math.abs(parsed.data.quantity),
    cost_cents_snapshot: 0,
    kind: "ajuste",
  });

  revalidatePath(`/${businessSlug}/admin/catalogo`);
  return actionOk(null);
}

// ═══════════════════════════════════════════════════════════════════
// FETCH SUB-RECIPE (for client component loading)
// ═══════════════════════════════════════════════════════════════════

/** Load sub-recipe lines for a composite ingredient. Callable from client components. */
export async function fetchSubRecipeLines(
  ingredientId: string,
): Promise<IngredientRecipeLine[]> {
  const service = db();

  const { data: subLines } = await service
    .from("ingredient_recipes")
    .select(
      "id, parent_ingredient_id, child_ingredient_id, quantity, notes, ingredients!ingredient_recipes_child_ingredient_id_fkey(name, unit, waste_percent, ingredient_presentations(cost_cents, net_quantity, is_default))",
    )
    .eq("parent_ingredient_id", ingredientId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (subLines ?? []).map((row: any) => {
    const child = row.ingredients;
    const defaultPres = (child?.ingredient_presentations ?? []).find(
      (p: any) => p.is_default,
    );
    const costPerUnit =
      defaultPres && Number(defaultPres.net_quantity) > 0
        ? defaultPres.cost_cents / Number(defaultPres.net_quantity)
        : null;

    return {
      id: row.id,
      parentIngredientId: row.parent_ingredient_id,
      childIngredientId: row.child_ingredient_id,
      childIngredientName: child?.name ?? "—",
      childIngredientUnit: (child?.unit ?? "un") as IngredientUnit,
      quantity: Number(row.quantity),
      notes: row.notes,
      costPerUnit,
      wastePercent: Number(child?.waste_percent ?? 0),
    };
  });
}

/** Load presentations for an ingredient. Callable from client components. */
export async function fetchPresentations(ingredientId: string) {
  const service = db();
  const { data } = await service
    .from("ingredient_presentations")
    .select("id, ingredient_id, name, net_quantity, cost_cents, is_default, created_at")
    .eq("ingredient_id", ingredientId)
    .order("is_default", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((p: any) => ({
    id: p.id as string,
    name: p.name as string,
    net_quantity: Number(p.net_quantity),
    cost_cents: p.cost_cents as number,
    is_default: p.is_default as boolean,
  }));
}
