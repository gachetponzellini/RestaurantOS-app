"use client";

import type { ClockEntry } from "@/lib/rrhh/clock-queries";
import { ROLE_META } from "@/lib/admin/roles";
import type { BusinessRoleInput } from "@/lib/admin/roles";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function elapsedSince(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function PresentCards({ entries }: { entries: ClockEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No hay nadie fichado ahora.
      </p>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((e) => (
        <div
          key={e.id}
          className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200/60"
        >
          <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-zinc-900">
              {e.name}
            </p>
            <p className="text-xs text-zinc-500">
              {ROLE_META[e.role as BusinessRoleInput]?.label ?? e.role} ·
              Entrada {formatTime(e.clockIn)} · {elapsedSince(e.clockIn)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
