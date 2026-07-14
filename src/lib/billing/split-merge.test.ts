import { describe, expect, it } from "vitest";

import { applyPayment, type CobroMergeState } from "./split-merge";
import type { OrderSplit } from "./types";

// Fixture mínimo de split (solo los campos que el merge toca).
const split = (
  id: string,
  expected: number,
  paid: number,
  status: OrderSplit["status"] = "pending",
): OrderSplit =>
  ({
    id,
    order_id: "o1",
    business_id: "b1",
    split_mode: "por_personas",
    split_index: 0,
    label: null,
    expected_amount_cents: expected,
    paid_amount_cents: paid,
    status,
  }) as OrderSplit;

const state = (splits: OrderSplit[]): CobroMergeState => ({
  splits,
  appliedPaymentIds: [],
  closed: false,
});

const result = (
  id: string,
  split_id: string | null,
  amount_cents: number,
  splitDone: boolean,
  orderClosed: boolean,
) => ({ payment: { id, split_id, amount_cents }, splitDone, orderClosed });

describe("applyPayment — merge de cobro (spec 41)", () => {
  it("suma el pago al split correcto (por split_id) usando el monto del server", () => {
    const s0 = state([split("s1", 1000, 0), split("s2", 500, 0)]);
    const next = applyPayment(s0, result("p1", "s1", 1000, true, false), false);
    expect(next.splits[0].paid_amount_cents).toBe(1000);
    expect(next.splits[0].status).toBe("paid");
    expect(next.splits[1].paid_amount_cents).toBe(0); // s2 intacto
    expect(next.appliedPaymentIds).toEqual(["p1"]);
  });

  it("splitDone=false → suma parcial sin marcar pagado", () => {
    const s0 = state([split("s1", 1000, 0)]);
    const next = applyPayment(s0, result("p1", "s1", 400, false, false), false);
    expect(next.splits[0].paid_amount_cents).toBe(400);
    expect(next.splits[0].status).toBe("pending");
  });

  it("split implícito: rutea al '__implicit__' sin importar payment.split_id", () => {
    const s0 = state([split("__implicit__", 1500, 0)]);
    const next = applyPayment(s0, result("p1", null, 1500, true, true), true);
    expect(next.splits[0].paid_amount_cents).toBe(1500);
    expect(next.splits[0].status).toBe("paid");
    expect(next.closed).toBe(true);
  });

  it("dedup por payment.id: aplicar el mismo pago dos veces suma UNA sola vez", () => {
    const s0 = state([split("s1", 1000, 0)]);
    const once = applyPayment(s0, result("p1", "s1", 1000, true, true), false);
    const twice = applyPayment(once, result("p1", "s1", 1000, true, true), false);
    expect(twice.splits[0].paid_amount_cents).toBe(1000); // no 2000
    expect(twice.appliedPaymentIds).toEqual(["p1"]);
    expect(twice.closed).toBe(true);
  });

  it("orderClosed marca closed y es sticky", () => {
    const s0 = state([split("s1", 1000, 400)]);
    const next = applyPayment(s0, result("p1", "s1", 600, true, true), false);
    expect(next.closed).toBe(true);
    // un pago posterior que no cierra no re-abre
    const after = applyPayment(next, result("p2", "s1", 0, true, false), false);
    expect(after.closed).toBe(true);
  });

  it("pago a un split inexistente = no-op sobre montos (defensivo)", () => {
    const s0 = state([split("s1", 1000, 0)]);
    const next = applyPayment(s0, result("p1", "sX", 1000, true, false), false);
    expect(next.splits[0].paid_amount_cents).toBe(0); // sin sumar en ningún lado
  });

  it("no muta el estado de entrada", () => {
    const s0 = state([split("s1", 1000, 0)]);
    const snapshot = JSON.stringify(s0);
    applyPayment(s0, result("p1", "s1", 1000, true, true), false);
    expect(JSON.stringify(s0)).toBe(snapshot);
  });
});
