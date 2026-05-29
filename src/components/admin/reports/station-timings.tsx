import { Flame, Timer } from "lucide-react";

import { cn } from "@/lib/utils";
import type { StationTimings } from "@/lib/admin/reports-extra-query";

export function StationTimingsSection({ data }: { data: StationTimings }) {
  if (data.stations.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
        <header>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Cocina por sector
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Tiempos de preparación
          </h2>
        </header>
        <p className="mt-6 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-6 text-center text-sm italic text-zinc-500">
          Sin comandas entregadas con tiempo medible en este período.
        </p>
      </section>
    );
  }

  const maxAvg = Math.max(1, ...data.stations.map((s) => s.avgMinutes));

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Cocina por sector
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Tiempos de preparación
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Emisión → entrega de comanda · por estación
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Promedio general
          </p>
          <p className="text-2xl font-semibold tabular-nums text-zinc-900">
            {data.overallAvgMinutes.toFixed(1)}
            <span className="ml-1 text-sm font-medium text-zinc-500">min</span>
          </p>
        </div>
      </header>

      <div className="mt-5 space-y-3">
        {data.stations.map((s) => {
          const widthPct = (s.avgMinutes / maxAvg) * 100;
          return (
            <div
              key={s.stationId}
              className={cn(
                "rounded-xl p-3.5",
                s.isBottleneck ? "bg-rose-50/70" : "bg-zinc-50",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {s.isBottleneck ? (
                    <Flame className="size-4 text-rose-500" strokeWidth={2} />
                  ) : (
                    <Timer className="size-4 text-zinc-400" strokeWidth={2} />
                  )}
                  <span className="text-sm font-semibold text-zinc-900">
                    {s.stationName}
                  </span>
                  {s.isBottleneck ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[0.65rem] font-semibold text-rose-700">
                      cuello de botella
                    </span>
                  ) : null}
                </div>
                <span className="text-sm font-semibold tabular-nums text-zinc-900">
                  {s.avgMinutes.toFixed(1)} min
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/70">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    s.isBottleneck ? "bg-rose-500" : "bg-zinc-900",
                  )}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <p className="mt-1.5 text-[0.7rem] text-zinc-500">
                {s.ticketCount} comandas entregadas
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
