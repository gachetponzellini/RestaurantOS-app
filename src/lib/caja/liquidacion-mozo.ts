import type { PaymentMethod } from "./types";

export type RendicionPaymentInput = {
  method: PaymentMethod;
  amount_cents: number;
  tip_cents: number;
};

export type RendicionResult = {
  efectivo_cents: number;
  tickets_cents: number;
  por_metodo: Record<PaymentMethod, number>;
  total_propinas_cents: number;
};

const EMPTY_BY_METHOD: Record<PaymentMethod, number> = {
  cash: 0,
  card_manual: 0,
  mp_link: 0,
  mp_qr: 0,
  transfer: 0,
  other: 0,
};

export function calcularRendicionMozo(
  payments: RendicionPaymentInput[],
): RendicionResult {
  const por_metodo: Record<PaymentMethod, number> = { ...EMPTY_BY_METHOD };
  let efectivo_cents = 0;
  let tickets_cents = 0;
  let total_propinas_cents = 0;

  for (const p of payments) {
    const neto = p.amount_cents - p.tip_cents;
    por_metodo[p.method] += neto;

    if (p.method === "cash") {
      efectivo_cents += neto;
    } else {
      tickets_cents += neto;
    }

    total_propinas_cents += p.tip_cents;
  }

  return { efectivo_cents, tickets_cents, por_metodo, total_propinas_cents };
}
