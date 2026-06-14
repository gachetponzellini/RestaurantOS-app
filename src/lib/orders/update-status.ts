"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { notifyDeliveryStatusChange } from "@/lib/notifications/delivery-notify";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { ORDER_STATUSES, isValidTransition, type OrderStatus } from "./status";

const UpdateStatusInput = z.object({
  order_id: z.string().uuid(),
  business_slug: z.string().min(1),
  next_status: z.enum(ORDER_STATUSES),
  cancelled_reason: z.string().max(500).optional(),
});

export async function updateOrderStatus(
  input: unknown,
): Promise<ActionResult<{ order_id: string; status: OrderStatus }>> {
  const parsed = UpdateStatusInput.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");
  const { order_id, business_slug, next_status, cancelled_reason } =
    parsed.data;

  if (next_status === "cancelled" && !cancelled_reason?.trim()) {
    return actionError("Motivo de cancelación requerido.");
  }

  const supabase = await createSupabaseServerClient();

  const { data: current, error: fetchErr } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", order_id)
    .maybeSingle();
  if (fetchErr || !current) return actionError("Pedido no encontrado.");

  const from = current.status as OrderStatus;
  if (!isValidTransition(from, next_status)) {
    return actionError(
      `No se puede pasar de "${from}" a "${next_status}".`,
    );
  }

  const { error: updateErr } = await supabase
    .from("orders")
    .update({
      status: next_status,
      cancelled_reason:
        next_status === "cancelled" ? (cancelled_reason ?? null) : null,
    })
    .eq("id", order_id);
  if (updateErr) {
    console.error("updateOrderStatus", updateErr);
    return actionError("No pudimos actualizar el estado.");
  }

  // Aviso de WhatsApp al cliente por el nuevo estado de delivery. Best-effort:
  // la función no lanza y no bloquea el cambio de estado (si WhatsApp no está
  // conectado, queda registrado en el outbox sin afectar la operación).
  await notifyDeliveryStatusChange({ orderId: order_id, toStatus: next_status });

  revalidatePath(`/${business_slug}/admin`);
  revalidatePath(`/${business_slug}/admin/pedidos/${order_id}`);
  return actionOk({ order_id, status: next_status });
}
