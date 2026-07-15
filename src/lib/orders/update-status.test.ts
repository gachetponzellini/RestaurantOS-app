import { describe, it, expect } from "vitest";
import { isOnlinePendingAdvance, isValidTransition } from "./status";

describe("isValidTransition", () => {
  it("allows the happy delivery path", () => {
    expect(isValidTransition("pending", "confirmed")).toBe(true);
    expect(isValidTransition("confirmed", "preparing")).toBe(true);
    expect(isValidTransition("preparing", "ready")).toBe(true);
    expect(isValidTransition("ready", "on_the_way")).toBe(true);
    expect(isValidTransition("on_the_way", "delivered")).toBe(true);
  });

  it("allows the happy pickup path (ready → delivered)", () => {
    expect(isValidTransition("ready", "delivered")).toBe(true);
  });

  it("allows cancelling from any active status", () => {
    expect(isValidTransition("pending", "cancelled")).toBe(true);
    expect(isValidTransition("preparing", "cancelled")).toBe(true);
    expect(isValidTransition("on_the_way", "cancelled")).toBe(true);
  });

  it("rejects going backward", () => {
    expect(isValidTransition("preparing", "pending")).toBe(false);
    expect(isValidTransition("delivered", "pending")).toBe(false);
    expect(isValidTransition("ready", "confirmed")).toBe(false);
  });

  it("rejects transitions from terminal statuses", () => {
    expect(isValidTransition("delivered", "cancelled")).toBe(false);
    expect(isValidTransition("cancelled", "pending")).toBe(false);
    expect(isValidTransition("delivered", "on_the_way")).toBe(false);
  });

  it("rejects skipping intermediate steps", () => {
    expect(isValidTransition("pending", "delivered")).toBe(false);
    expect(isValidTransition("confirmed", "ready")).toBe(false);
  });

  it("allows pending → preparing (skip confirmed)", () => {
    expect(isValidTransition("pending", "preparing")).toBe(true);
  });

  it("allows salon skip-ready: preparing → delivered", () => {
    expect(isValidTransition("preparing", "delivered")).toBe(true);
  });
});

// spec 047 — guard server: un pedido online en `pending` solo se manda a cocina
// con "Confirmar" (routeOrderToCocina). updateOrderStatus lo rechaza para no
// dejarlo en `preparing` sin comandas ni impresión (pérdida silenciosa).
describe("isOnlinePendingAdvance", () => {
  it("blocks advancing an online pending order (pickup/delivery)", () => {
    expect(isOnlinePendingAdvance("pending", "pickup", "confirmed")).toBe(true);
    expect(isOnlinePendingAdvance("pending", "pickup", "preparing")).toBe(true);
    expect(isOnlinePendingAdvance("pending", "delivery", "confirmed")).toBe(true);
  });

  it("allows cancelling an online pending order", () => {
    expect(isOnlinePendingAdvance("pending", "pickup", "cancelled")).toBe(false);
    expect(isOnlinePendingAdvance("pending", "delivery", "cancelled")).toBe(false);
  });

  it("does not apply to dine-in (marcha por el mozo)", () => {
    expect(isOnlinePendingAdvance("pending", "dine_in", "preparing")).toBe(false);
    expect(isOnlinePendingAdvance("pending", "dine_in", "confirmed")).toBe(false);
  });

  it("does not apply once past pending", () => {
    expect(isOnlinePendingAdvance("confirmed", "pickup", "preparing")).toBe(false);
    expect(isOnlinePendingAdvance("preparing", "pickup", "ready")).toBe(false);
    expect(isOnlinePendingAdvance("ready", "delivery", "on_the_way")).toBe(false);
  });
});
