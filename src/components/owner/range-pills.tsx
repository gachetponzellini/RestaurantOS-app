import Link from "next/link";

import type { ReportRange } from "@/lib/admin/reports-query";
import { cn } from "@/lib/utils";

const LABELS: Record<ReportRange, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  "7d": "7 días",
  "30d": "30 días",
};

const ORDER: ReportRange[] = ["today", "yesterday", "7d", "30d"];

/** Selector de rango simple para "Mis locales" (presets vía ?range=…). */
export function RangePills({
  basePath,
  active,
}: {
  basePath: string;
  active: ReportRange | "custom";
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-zinc-100 p-1">
      {ORDER.map((r) => {
        const isActive = active === r;
        return (
          <Link
            key={r}
            href={`${basePath}?range=${r}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
              isActive
                ? "bg-zinc-900 text-white shadow-sm"
                : "text-zinc-600 hover:text-zinc-900",
            )}
          >
            {LABELS[r]}
          </Link>
        );
      })}
    </div>
  );
}
