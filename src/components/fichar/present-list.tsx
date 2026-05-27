"use client";

import type { PresentEmployee } from "@/lib/rrhh/clock-actions";
import { PresentEmployeeCard } from "@/components/shared/present-employee-card";

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
      <div className="grid gap-2 landscape:sm:grid-cols-2">
        {present.map((p) => (
          <PresentEmployeeCard
            key={p.userId + p.clockIn}
            name={p.name}
            role={p.role}
            clockIn={p.clockIn}
            variant="dark"
          />
        ))}
      </div>
    </div>
  );
}
