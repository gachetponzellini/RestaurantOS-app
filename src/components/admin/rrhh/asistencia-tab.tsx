"use client";

import type { ClockEntry, TodaySummary } from "@/lib/rrhh/clock-queries";
import { PresentCards } from "./present-cards";
import { HistoryTable } from "./history-table";

export function AsistenciaTab({
  today,
  history,
}: {
  today: TodaySummary;
  history: ClockEntry[];
}) {
  return (
    <div className="space-y-8">
      {/* Presentes ahora */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Presentes ahora ({today.present.length})
        </h3>
        <PresentCards entries={today.present} />
      </section>

      {/* Hoy */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Hoy — ya se fueron ({today.finished.length})
        </h3>
        {today.finished.length > 0 ? (
          <HistoryTable entries={today.finished} />
        ) : (
          <p className="text-sm text-zinc-500">Nadie fichó salida hoy todavía.</p>
        )}
      </section>

      {/* Ausentes */}
      {today.absent.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Sin fichada hoy ({today.absent.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {today.absent.map((a) => (
              <span
                key={a.userId}
                className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600"
              >
                {a.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Historial reciente */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Historial reciente
        </h3>
        <HistoryTable entries={history} />
      </section>
    </div>
  );
}
