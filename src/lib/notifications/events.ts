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

/**
 * Avisa que el print agent no pudo imprimir una comanda (spec 33). Resuelve el
 * sector + la mesa/origen desde la comanda y notifica al `encargado` (broadcast)
 * y al **mozo de la mesa** (si es dine-in con mozo). Best-effort.
 *
 * El **dedup** (no avisar en cada reintento) lo maneja el caller vía
 * `comandas.print_failed_at` — acá solo se emite el aviso. Sin actor (lo dispara
 * el sistema/agente, no un usuario).
 */
export async function notifyPrintFailed(params: {
  businessId: string;
  comandaId: string;
}): Promise<void> {
  const service = createSupabaseServiceClient();

  const { data: comanda } = await service
    .from("comandas")
    .select(
      "station_id, stations(name), orders!inner(order_number, delivery_type, tables!orders_table_id_fkey(label, mozo_id))",
    )
    .eq("id", params.comandaId)
    .maybeSingle();
  if (!comanda) return;

  const station = (comanda as { stations: { name: string } | null }).stations;
  const order = (comanda as {
    orders: {
      order_number: number | null;
      delivery_type: string;
      tables: { label: string; mozo_id: string | null } | null;
    } | null;
  }).orders;

  const payload = {
    stationName: station?.name ?? "Cocina",
    tableLabel: order?.tables?.label,
    orderNumber: order?.order_number ?? undefined,
    deliveryType: order?.delivery_type,
  };

  // Broadcast al encargado.
  await createNotification({
    businessId: params.businessId,
    targetRole: "encargado",
    type: "comanda.impresion_fallida",
    payload,
  });

  // Puntual al mozo de la mesa (dine-in con mozo asignado).
  const mozoId = order?.tables?.mozo_id ?? null;
  if (mozoId) {
    await createNotification({
      businessId: params.businessId,
      userId: mozoId,
      type: "comanda.impresion_fallida",
      payload,
    });
  }
}
