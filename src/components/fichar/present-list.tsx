"use client";

import type { PresentEmployee } from "@/lib/rrhh/clock-actions";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PresentList({ present }: { present: PresentEmployee[] }) {
  if (present.length === 0) {
    return (
      <p className="text-center text-sm text-zinc-500">
        No hay nadie fichado ahora.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Presentes ahora ({present.length})
      </p>
      <div className="grid gap-2">
        {present.map((p) => (
          <div
            key={p.userId}
            className="flex items-center gap-3 rounded-xl bg-zinc-800/50 px-4 py-2.5"
          >
            <span className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-400" />
            <span className="flex-1 truncate text-sm font-medium text-zinc-200">
              {p.name}
            </span>
            <span className="text-xs text-zinc-500">
              {formatTime(p.clockIn)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
