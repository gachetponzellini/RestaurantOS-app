"use client";

import type { ClockEntry } from "@/lib/rrhh/clock-queries";
import { PresentEmployeeCard } from "@/components/shared/present-employee-card";

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
        <PresentEmployeeCard
          key={e.id}
          name={e.name}
          role={e.role}
          clockIn={e.clockIn}
        />
      ))}
    </div>
  );
}
