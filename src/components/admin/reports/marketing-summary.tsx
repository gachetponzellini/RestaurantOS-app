import { Megaphone, TicketPercent } from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import type { MarketingSummary } from "@/lib/admin/reports-extra-query";

export function MarketingSummarySection({
  data,
}: {
  data: MarketingSummary;
}) {
  const redemption = data.redemptionRatePct;

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
      <header className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
          <Megaphone className="size-4" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Marketing
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
            Promociones y campañas
          </h2>
        </div>
      </header>

      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-zinc-50 p-3">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Descuentos
          </dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-rose-600">
            {formatCurrency(data.discountsCents)}
          </dd>
          <dd className="text-[0.7rem] text-zinc-500">resignado en el período</dd>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Ingreso con promo
          </dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">
            {formatCurrency(data.revenueWithPromoCents)}
          </dd>
          <dd className="text-[0.7rem] text-zinc-500">
            {data.ordersWithPromo} pedidos con código
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center gap-3 rounded-xl bg-zinc-50 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
          <TicketPercent className="size-4" strokeWidth={2} />
        </span>
        <div className="flex-1">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Redención de campañas
          </p>
          <p className="text-sm text-zinc-500">
            {data.campaignsRedeemed} de {data.campaignsSent} enviadas
          </p>
        </div>
        <p className="text-2xl font-semibold tabular-nums text-zinc-900">
          {redemption === null ? "—" : `${redemption.toFixed(0)}%`}
        </p>
      </div>
    </section>
  );
}
