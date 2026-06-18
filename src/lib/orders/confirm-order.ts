"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { actionError, type ActionResult } from "@/lib/actions";
import { requireMozoActionContext } from "@/lib/mozo/auth";
import { canConfirmOrder } from "@/lib/permissions/can";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

import { routeOrderToCocina, type RouteOrderResult } from "./route-to-cocina";

type GenericClient = SupabaseClient;

export type ConfirmarPedidoResult = RouteOrderResult;

/**
 * Fallback manual: toma un pedido entrante (delivery / take-away / web /
 * chatbot) en estado `pending`, rutea a cocina vía `routeOrderToCocina`.
 *
 * Solo encargado / admin / platform admin (`canConfirmOrder`).
 * Idempotente via `routeOrderToCocina`.
 */
export async function confirmarPedido(
  orderId: string,
  slug: string,
): Promise<ActionResult<ConfirmarPedidoResult>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  if (!canConfirmOrder(ctxResult.data.role)) {
    return actionError("Solo encargado o admin pueden confirmar pedidos.");
  }

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const { data: order } = await service
    .from("orders")
    .select("id, business_id, status, delivery_type")
    .eq("id", orderId)
    .maybeSingle();
  type OrderRow = {
    id: string;
    business_id: string;
    status: string;
    delivery_type: string;
  };
  const orderRow = order as OrderRow | null;
  if (!orderRow || orderRow.business_id !== business.id) {
    return actionError("Pedido no encontrado.");
  }
  if (orderRow.delivery_type === "dine_in") {
    return actionError(
      "Los pedidos en mesa no se confirman acá — los carga el mozo desde el salón.",
    );
  }
  if (orderRow.status !== "pending") {
    return actionError(`El pedido ya está en estado "${orderRow.status}".`);
  }

  const result = await routeOrderToCocina(orderId, business.id);

  revalidatePath(`/${slug}/admin/pedidos`);
  revalidatePath(`/${slug}/admin/operacion`);
  revalidatePath(`/${slug}/mozo`);

  return result;
}
