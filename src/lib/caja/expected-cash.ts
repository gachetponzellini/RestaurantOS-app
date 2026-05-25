import type { CajaMovimientoKind, PaymentMethod } from "./types";

export type ExpectedCashInput = {
  last_closing_cash_cents: number;
  payments: Array<{ method: PaymentMethod; amount_cents: number }>;
  movimientos: Array<{ kind: CajaMovimientoKind; amount_cents: number }>;
};

export function calculateExpectedCash(input: ExpectedCashInput): number {
  const cashPayments = input.payments
    .filter((p) => p.method === "cash")
    .reduce((acc, p) => acc + p.amount_cents, 0);

  const ingresos = input.movimientos
    .filter((m) => m.kind === "ingreso")
    .reduce((acc, m) => acc + m.amount_cents, 0);

  const sangrias = input.movimientos
    .filter((m) => m.kind === "sangria")
    .reduce((acc, m) => acc + m.amount_cents, 0);

  return input.last_closing_cash_cents + cashPayments + ingresos - sangrias;
}
