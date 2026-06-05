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
