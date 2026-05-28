"use server";

import { revalidatePath } from "next/cache";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { requireMozoActionContext } from "@/lib/mozo/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

// ── toggleTrackStock ─────────────────────────────────────────────

export async function toggleTrackStock(
  productId: string,
  enabled: boolean,
  slug: string,
): Promise<ActionResult<void>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  const ctx = ctxResult.data;

  if (ctx.role !== "admin" && ctx.role !== "encargado") {
    return actionError("Solo admin o encargado pueden gestionar stock.");
  }

  const service = createSupabaseServiceClient();

  const { data: product } = await service
    .from("products")
    .select("id, business_id")
    .eq("id", productId)
    .maybeSingle();
  if (!product || product.business_id !== business.id) {
    return actionError("Producto no encontrado.");
  }

  await service
    .from("products")
    .update({ track_stock: enabled })
    .eq("id", productId);

  if (enabled) {
    const { data: existing } = await service
      .from("stock_items")
      .select("id")
      .eq("product_id", productId)
      .eq("business_id", business.id)
      .maybeSingle();

    if (!existing) {
      await service.from("stock_items").insert({
        business_id: business.id,
        product_id: productId,
        current_qty: 0,
        min_qty: 0,
      });
    }
  }

  revalidatePath(`/${slug}/admin/catalogo`);
  return actionOk(undefined);
}

// ── setStockLevels ───────────────────────────────────────────────

export async function setStockLevels(
  productId: string,
  currentQty: number,
  minQty: number,
  slug: string,
): Promise<ActionResult<void>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  const ctx = ctxResult.data;

  if (ctx.role !== "admin" && ctx.role !== "encargado") {
    return actionError("Solo admin o encargado pueden gestionar stock.");
  }

  if (currentQty < 0) return actionError("La cantidad no puede ser negativa.");
  if (minQty < 0) return actionError("El mínimo no puede ser negativo.");

  const service = createSupabaseServiceClient();

  const { data: product } = await service
    .from("products")
    .select("id, business_id")
    .eq("id", productId)
    .maybeSingle();
  if (!product || product.business_id !== business.id) {
    return actionError("Producto no encontrado.");
  }

  const { data: stockItem } = await service
    .from("stock_items")
    .select("id")
    .eq("product_id", productId)
    .eq("business_id", business.id)
    .maybeSingle();

  if (stockItem) {
    await service
      .from("stock_items")
      .update({ current_qty: currentQty, min_qty: minQty, updated_at: new Date().toISOString() })
      .eq("id", stockItem.id);
  } else {
    await service.from("stock_items").insert({
      business_id: business.id,
      product_id: productId,
      current_qty: currentQty,
      min_qty: minQty,
    });
    await service
      .from("products")
      .update({ track_stock: true })
      .eq("id", productId);
  }

  revalidatePath(`/${slug}/admin/catalogo`);
  return actionOk(undefined);
}

// ── ingresarStock ────────────────────────────────────────────────

export async function ingresarStock(
  productId: string,
  qty: number,
  slug: string,
  reason?: string,
): Promise<ActionResult<void>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  const ctx = ctxResult.data;

  if (ctx.role !== "admin" && ctx.role !== "encargado") {
    return actionError("Solo admin o encargado pueden ingresar stock.");
  }

  if (qty <= 0) return actionError("La cantidad debe ser mayor a 0.");

  const service = createSupabaseServiceClient();

  const { data: stockItem } = await service
    .from("stock_items")
    .select("id, business_id")
    .eq("product_id", productId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!stockItem) return actionError("El producto no tiene stock trackeado.");

  await service
    .from("stock_items")
    .update({
      current_qty: (await service.from("stock_items").select("current_qty").eq("id", stockItem.id).single()).data!.current_qty + qty,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stockItem.id);

  await service.from("stock_movimientos").insert({
    stock_item_id: stockItem.id,
    business_id: business.id,
    kind: "ingreso",
    qty,
    reason: reason?.trim() || null,
    created_by: ctx.userId,
  });

  // Re-enable product if it was disabled due to 0 stock
  const { data: updated } = await service
    .from("stock_items")
    .select("current_qty")
    .eq("id", stockItem.id)
    .single();
  if (updated && updated.current_qty > 0) {
    await service
      .from("products")
      .update({ is_available: true })
      .eq("id", productId);
  }

  revalidatePath(`/${slug}/admin/catalogo`);
  return actionOk(undefined);
}

// ── ajustarStock ─────────────────────────────────────────────────

export async function ajustarStock(
  productId: string,
  qty: number,
  reason: string,
  slug: string,
): Promise<ActionResult<void>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  const ctx = ctxResult.data;

  if (ctx.role !== "admin" && ctx.role !== "encargado") {
    return actionError("Solo admin o encargado pueden ajustar stock.");
  }

  if (!reason || reason.trim() === "") {
    return actionError("El motivo es obligatorio para ajustes.");
  }
  if (qty === 0) return actionError("La cantidad no puede ser 0.");

  const service = createSupabaseServiceClient();

  const { data: stockItem } = await service
    .from("stock_items")
    .select("id, business_id, current_qty")
    .eq("product_id", productId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!stockItem) return actionError("El producto no tiene stock trackeado.");

  const newQty = stockItem.current_qty + qty;

  await service
    .from("stock_items")
    .update({ current_qty: newQty, updated_at: new Date().toISOString() })
    .eq("id", stockItem.id);

  await service.from("stock_movimientos").insert({
    stock_item_id: stockItem.id,
    business_id: business.id,
    kind: "ajuste",
    qty,
    reason: reason.trim(),
    created_by: ctx.userId,
  });

  if (newQty <= 0) {
    await service
      .from("products")
      .update({ is_available: false })
      .eq("id", productId);
  } else {
    await service
      .from("products")
      .update({ is_available: true })
      .eq("id", productId);
  }

  revalidatePath(`/${slug}/admin/catalogo`);
  return actionOk(undefined);
}
