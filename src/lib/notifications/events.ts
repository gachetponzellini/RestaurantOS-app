import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { createNotification } from "./create";

/**
 * Notifica la anulación de un ítem (spec 27). El destinatario depende de quién
 * lo cancela (principio "no notificar al actor", design D3):
 *   - actor `mozo` → broadcast a `encargado`.
 *   - actor `encargado`/`admin` → puntual al **mozo de la mesa** (omitido si el
 *     mozo es el propio actor).
 *   - mesa sin mozo asignado (delivery, bar) → broadcast a `encargado`.
 *
 * Resuelve la mesa (label + mozo) desde el `orderId`. Best-effort.
 */
export async function notifyItemCancelled(params: {
  businessId: string;
  orderId: string;
  reason: string;
  actorUserId: string;
  actorRole: string;
}): Promise<void> {
  const service = createSupabaseServiceClient();

  const { data: order } = await service
    .from("orders")
    .select("table_id")
    .eq("id", params.orderId)
    .maybeSingle();
  const tableId = (order as { table_id: string | null } | null)?.table_id ?? null;

  let tableLabel: string | undefined;
  let mozoId: string | null = null;
  if (tableId) {
    const { data: table } = await service
      .from("tables")
      .select("label, mozo_id")
      .eq("id", tableId)
      .maybeSingle();
    tableLabel = (table as { label: string } | null)?.label;
    mozoId = (table as { mozo_id: string | null } | null)?.mozo_id ?? null;
  }

  const payload = { tableLabel, reason: params.reason };

  if (params.actorRole === "mozo" || !mozoId) {
    await createNotification({
      businessId: params.businessId,
      targetRole: "encargado",
      type: "item.cancelado",
      payload,
      actorUserId: params.actorUserId,
    });
  } else {
    await createNotification({
      businessId: params.businessId,
      userId: mozoId,
      type: "item.cancelado",
      payload,
      actorUserId: params.actorUserId,
    });
  }
}
