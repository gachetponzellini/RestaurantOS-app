"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ReportRange } from "@/lib/admin/reports-query";
import { cn } from "@/lib/utils";

const LABELS: Record<ReportRange, string> = {
  today: "Hoy",
  yesterday: "Ayer",
  "7d": "7 días",
  "30d": "30 días",
};

const ORDER: ReportRange[] = ["today", "yesterday", "7d", "30d"];

export function RangeSelector({
  slug,
  active,
  customStart,
  customEnd,
}: {
  slug: string;
  active: ReportRange | "custom";
  customStart?: string;
  customEnd?: string;
}) {
  const router = useRouter();
  const [showCustom, setShowCustom] = useState(active === "custom");
  const [start, setStart] = useState(customStart ?? "");
  const [end, setEnd] = useState(customEnd ?? "");

  const isCustomActive = active === "custom";

  function applyCustomRange(s: string, e: string) {
    if (s && e && s <= e) {
      router.push(`/${slug}/admin/reportes?start=${s}&end=${e}`);
    }
  }

  const pill = (isActive: boolean) =>
    cn(
      "shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition cursor-pointer",
      isActive ? "text-white shadow-sm" : "text-zinc-600 hover:text-zinc-900",
    );

  const pillStyle = (isActive: boolean) =>
    isActive
      ? { background: "var(--brand)", color: "var(--brand-foreground)" }
      : undefined;

  return (
    <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
      <nav
        aria-label="Rango del reporte"
        className="inline-flex max-w-full overflow-x-auto rounded-full bg-white p-1 ring-1 ring-zinc-200/70"
      >
        {ORDER.map((r) => {
          const isActive = active === r;
          return (
            <Link
              key={r}
              href={`/${slug}/admin/reportes?range=${r}`}
              aria-pressed={isActive}
              className={pill(isActive)}
              style={pillStyle(isActive)}
              onClick={() => setShowCustom(false)}
            >
              {LABELS[r]}
            </Link>
          );
        })}
        <button
          type="button"
          aria-pressed={isCustomActive}
          className={pill(isCustomActive)}
          style={pillStyle(isCustomActive)}
          onClick={() => setShowCustom((v) => !v)}
        >
          Personalizado
        </button>
      </nav>

      {showCustom && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-zinc-200/70">
          <label className="flex items-center gap-1.5 text-xs text-zinc-600">
            Desde
            <input
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (e.target.value && end && e.target.value <= end) {
                  applyCustomRange(e.target.value, end);
                }
              }}
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-900"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-zinc-600">
            Hasta
            <input
              type="date"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                if (start && e.target.value && start <= e.target.value) {
                  applyCustomRange(start, e.target.value);
                }
              }}
              className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-900"
            />
          </label>
        </div>
      )}
    </div>
  );
}
