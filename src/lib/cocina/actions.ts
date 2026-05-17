"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

type GenericClient = SupabaseClient;

type KitchenStatus = "pending" | "preparing" | "ready" | "delivered";

/**
 * Avanza el `kitchen_status` de todos los items vivos de una orden (los que
 * no están `delivered`) al `toStatus` indicado.
 *
 * Esta función vive separada de `lib/mozo/actions` porque pertenece al
 * dominio cocina, no mozo. La pantalla `/cocina` (kanban legacy) la usa
 * para que admin/encargado puedan monitorear flow desde una vista única.
 * Post-D3 [decisiones/d3-cocina-impresion-termica](../../../wiki/decisiones/d3-cocina-impresion-termica.md)
 * la cocina del piloto recibe ticket impreso y no usa esta acción — queda
 * disponible para reactivarse en Fase 2 si vuelve la pantalla con login.
 *
 * Cross-tenant defense via business_id en orders.
 */
export async function updateKitchenStatusForOrder(
  orderId: string,
  toStatus: KitchenStatus,
  businessSlug: string,
): Promise<ActionResult<void>> {
  const business = await getBusiness(businessSlug);
  if (!business) return actionError("Negocio no encontrado.");

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const { data: order } = await service
    .from("orders")
    .select("id, business_id")
    .eq("id", orderId)
    .maybeSingle();
  if (
    !order ||
    (order as { business_id: string } | null)?.business_id !== business.id
  ) {
    return actionError("Orden no encontrada.");
  }

  const { error } = await service
    .from("order_items")
    .update({ kitchen_status: toStatus })
    .eq("order_id", orderId)
    .neq("kitchen_status", "delivered");

  if (error) {
    console.error("updateKitchenStatusForOrder", error);
    return actionError("No pudimos actualizar el estado de cocina.");
  }

  revalidatePath(`/${businessSlug}/cocina`);
  return actionOk(undefined);
}
