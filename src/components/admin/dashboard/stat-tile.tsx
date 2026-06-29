import type { ReactNode } from "react";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

type Trend = {
  direction: "up" | "down" | "flat";
  label: string;
};

type Accent = false | "dark" | "brand";

export function StatTile({
  eyebrow,
  value,
  sub,
  icon,
  trend,
  accent = false,
}: {
  eyebrow: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  trend?: Trend;
  accent?: Accent;
}) {
  const isBrand = accent === "brand";
  const isDark = accent === "dark";
  const isAccent = isBrand || isDark;

  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between gap-4 rounded-2xl p-4 transition sm:gap-5 sm:p-5",
        !isAccent &&
          "bg-white ring-1 ring-zinc-200/70 hover:ring-zinc-300 hover:shadow-sm",
        isDark && "bg-zinc-900 text-zinc-50 ring-1 ring-zinc-900",
      )}
      style={
        isBrand
          ? {
              background: "var(--brand)",
              color: "var(--brand-foreground)",
              boxShadow: "0 18px 36px -22px var(--brand)",
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "text-[0.65rem] font-semibold uppercase tracking-[0.14em]",
            isAccent ? "opacity-80" : "text-zinc-500",
          )}
        >
          {eyebrow}
        </span>
        {icon ? (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-xl transition",
              isAccent
                ? "bg-white/15 text-current"
                : "bg-zinc-100 text-zinc-700 group-hover:bg-zinc-900 group-hover:text-white",
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div>
        <div className="text-2xl font-semibold leading-none tracking-tight tabular-nums sm:text-3xl">
          {value}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {trend ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold",
                !isAccent &&
                  trend.direction === "up" &&
                  "bg-emerald-50 text-emerald-700",
                !isAccent &&
                  trend.direction === "down" &&
                  "bg-rose-50 text-rose-700",
                !isAccent &&
                  trend.direction === "flat" &&
                  "bg-zinc-100 text-zinc-600",
                isAccent && "bg-white/15 text-current",
              )}
            >
              {trend.direction === "up" ? (
                <TrendingUp className="size-3" strokeWidth={2.25} />
              ) : trend.direction === "down" ? (
                <TrendingDown className="size-3" strokeWidth={2.25} />
              ) : (
                <Minus className="size-3" strokeWidth={2.25} />
              )}
              {trend.label}
            </span>
          ) : null}
          {sub ? (
            <span
              className={cn(
                "text-xs",
                isAccent ? "opacity-80" : "text-zinc-500",
              )}
            >
              {sub}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
