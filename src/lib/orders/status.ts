export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "on_the_way",
  "delivered",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

const FORWARD: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "preparing", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "delivered", "cancelled"],
  ready: ["on_the_way", "delivered", "cancelled"],
  on_the_way: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function isValidTransition(
  from: OrderStatus,
  to: OrderStatus,
): boolean {
  return FORWARD[from].includes(to);
}

/**
 * spec 047 — un pedido online (no dine-in) en `pending` solo se manda a cocina
 * con `confirmarPedido()` → `routeOrderToCocina` (crea comandas + dispara la
 * impresión). Avanzarlo por `updateOrderStatus` (cambio de columna) lo dejaría
 * en `preparing` SIN comandas ni impresión: pérdida silenciosa. Cancelar sí se
 * permite. Devuelve true cuando el avance debe rechazarse por este motivo.
 */
export function isOnlinePendingAdvance(
  from: OrderStatus,
  deliveryType: string,
  to: OrderStatus,
): boolean {
  return from === "pending" && deliveryType !== "dine_in" && to !== "cancelled";
}
