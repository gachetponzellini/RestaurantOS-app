import { formatCurrency } from "@/lib/currency";
import type { StaffPerformance } from "@/lib/admin/staff-query";

export function MozoLeaderboard({ data }: { data: StaffPerformance }) {
  if (data.mozos.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
        <header>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Personal
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Performance de mozos
          </h2>
        </header>
        <p className="mt-6 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-6 text-center text-sm italic text-zinc-500">
          Sin cobros atribuidos a mozos en este período.
        </p>
      </section>
    );
  }

  const maxSales = Math.max(1, ...data.mozos.map((m) => m.salesCents));

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Personal
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Performance de mozos
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Ventas atribuidas según cobro · ordenado por facturación
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Propinas totales
          </p>
          <p className="text-2xl font-semibold tabular-nums text-zinc-900">
            {formatCurrency(data.totalTipsCents)}
          </p>
        </div>
      </header>

      <div className="mt-5 space-y-3">
        {data.mozos.map((m, i) => {
          const widthPct = (m.salesCents / maxSales) * 100;
          const avgTicket =
            m.paymentCount > 0 ? m.salesCents / m.paymentCount : 0;
          return (
            <div key={m.mozoId} className="rounded-xl bg-zinc-50 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[0.7rem] font-semibold text-white tabular-nums">
                    {i + 1}
                  </span>
                  <span className="text-sm font-semibold text-zinc-900">
                    {m.name}
                  </span>
                </div>
                <span className="text-sm font-semibold tabular-nums text-zinc-900">
                  {formatCurrency(m.salesCents)}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/70">
                <div
                  className="h-full rounded-full bg-zinc-900 transition-all duration-700"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-zinc-500">
                <span>
                  {m.paymentCount} cobros · ticket {formatCurrency(avgTicket)}
                </span>
                <span>
                  Propina {formatCurrency(m.tipsCents)}
                  <span className="ml-1 font-semibold text-emerald-600">
                    {m.tipRatePct.toFixed(1)}%
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
