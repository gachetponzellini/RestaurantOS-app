"use client";

import type { ClockEntry } from "@/lib/rrhh/clock-queries";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function HistoryTable({ entries }: { entries: ClockEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No hay fichadas en el período seleccionado.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-zinc-200/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <th className="px-4 py-3">Nombre</th>
            <th className="px-4 py-3">Fecha</th>
            <th className="px-4 py-3">Entrada</th>
            <th className="px-4 py-3">Salida</th>
            <th className="px-4 py-3">Duración</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {entries.map((e) => (
            <tr key={e.id} className="hover:bg-zinc-50/50">
              <td className="px-4 py-3 font-medium text-zinc-900">{e.name}</td>
              <td className="px-4 py-3 text-zinc-600">{formatDate(e.clockIn)}</td>
              <td className="px-4 py-3 tabular-nums text-zinc-600">
                {formatTime(e.clockIn)}
              </td>
              <td className="px-4 py-3 tabular-nums text-zinc-600">
                {e.clockOut ? formatTime(e.clockOut) : "—"}
              </td>
              <td className="px-4 py-3 tabular-nums text-zinc-900 font-medium">
                {formatDuration(e.durationMinutes)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
