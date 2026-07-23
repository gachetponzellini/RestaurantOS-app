"use server";

import { actionError, type ActionResult } from "@/lib/actions";
import { requireMozoActionContext } from "@/lib/mozo/auth";
import { canCargarPedido } from "@/lib/permissions/can";
import { getBusiness } from "@/lib/tenant";

import { persistOrder, type CreateOrderResult } from "./persist-order";
import { StaffOrderInput, type CreateOrderInput } from "./schema";

/**
 * Carga a mano un pedido para llevar / delivery SIN mesa desde operación
 * (spec 054): el pedido de mostrador o telefónico, que hoy sólo entra
 * automático por la carta pública. Reusa `persistOrder` (que ya crea la orden
 * sin `table_id`, con items/combos/modifiers) y registra en `orders.mozo_id`
 * quién lo cargó.
 *
 * A diferencia del checkout público (`createOrder`), autentica con el gate del
 * staff (`requireMozoActionContext` + `canCargarPedido`, mostrador =
 * encargado/admin) en vez de exigir sesión de cliente + rate-limit por IP.
 *
 * El pedido nace en efectivo/`pending` y NO marcha a cocina: aparece en el
 * board (columna «Nuevos») y se marcha con el «Confirmar» existente
 * (`confirmarPedido`, spec 047). El cobro es aparte (US3, desde la card).
 */
export async function cargarPedidoStaff(
  input: unknown,
): Promise<ActionResult<CreateOrderResult>> {
  const parsed = StaffOrderInput.safeParse(input);
  if (!parsed.success) {
    return actionError(
      parsed.error.issues[0]?.message ?? "Datos del pedido inválidos.",
    );
  }
  const data = parsed.data;

  const business = await getBusiness(data.business_slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  if (!canCargarPedido(ctxResult.data.role)) {
    return actionError("No tenés permiso para cargar pedidos.");
  }

  // Defaults de mostrador: nombre anónimo → "Mostrador"; sin teléfono en pickup
  // → "-" (placeholder compartido, igual que el pedido flash). En delivery el
  // schema ya exigió teléfono + dirección.
  const mapped: CreateOrderInput = {
    business_slug: data.business_slug,
    delivery_type: data.delivery_type,
    customer_name: data.customer_name?.trim() || "Mostrador",
    customer_phone: data.customer_phone?.trim() || "-",
    delivery_address: data.delivery_address?.trim() || undefined,
    delivery_notes: data.delivery_notes?.trim() || undefined,
    payment_method: "cash",
    items: data.items,
  };

  try {
    return await persistOrder(mapped, ctxResult.data.userId, {
      mozoId: ctxResult.data.userId,
    });
  } catch (err) {
    console.error("cargarPedidoStaff unexpected error", err);
    return actionError("No pudimos cargar el pedido. Intentá de nuevo.");
  }
}
