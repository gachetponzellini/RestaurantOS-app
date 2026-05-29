import { ArrowDownLeft, ArrowUpRight, Scale } from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type { CashControl } from "@/lib/admin/dashboard-query";

export function CashControlCard({ data }: { data: CashControl }) {
  const net = data.netDifferenceCents;
  const netLabel =
    net === 0 ? "Cuadrado" : net > 0 ? "Sobrante neto" : "Faltante neto";
  const netColor =
    net === 0
      ? "text-zinc-900"
      : net > 0
        ? "text-emerald-600"
        : "text-rose-600";

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
      <header>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Caja
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
          Control de arqueos
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500">
          {data.corteCount} {data.corteCount === 1 ? "corte" : "cortes"} en el
          período
        </p>
      </header>

      {data.corteCount === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-6 text-center text-sm italic text-zinc-500">
          Sin cierres de caja en este período.
        </p>
      ) : (
        <>
          <div className="mt-5 flex items-center gap-3 rounded-xl bg-zinc-50 p-4">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl",
                net === 0
                  ? "bg-zinc-200 text-zinc-700"
                  : net > 0
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-rose-100 text-rose-700",
              )}
            >
              <Scale className="size-4" strokeWidth={2} />
            </span>
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                {netLabel}
              </p>
              <p
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  netColor,
                )}
              >
                {net > 0 ? "+" : ""}
                {formatCurrency(net)}
              </p>
            </div>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-zinc-50 p-3">
              <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Faltantes
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-rose-600">
                {formatCurrency(data.shortageCents)}
              </dd>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3">
              <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                Sobrantes
              </dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums text-emerald-600">
                {formatCurrency(data.surplusCents)}
              </dd>
            </div>
          </dl>

          <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row">
            <div className="flex flex-1 items-center gap-2.5 rounded-xl bg-zinc-50 p-3">
              <ArrowDownLeft className="size-4 text-rose-500" strokeWidth={2} />
              <div>
                <p className="text-[0.7rem] text-zinc-500">Sangrías</p>
                <p className="font-semibold tabular-nums text-zinc-900">
                  {formatCurrency(data.sangriaCents)}
                </p>
              </div>
            </div>
            <div className="flex flex-1 items-center gap-2.5 rounded-xl bg-zinc-50 p-3">
              <ArrowUpRight className="size-4 text-emerald-500" strokeWidth={2} />
              <div>
                <p className="text-[0.7rem] text-zinc-500">Ingresos</p>
                <p className="font-semibold tabular-nums text-zinc-900">
                  {formatCurrency(data.ingresoCents)}
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
