import { Minus, TrendingDown, TrendingUp } from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import type {
  ComparisonDelta,
  ReportComparison,
  ReportSummary,
} from "@/lib/admin/reports-query";

function pct(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function DeltaBadge({
  delta,
  invert = false,
  accent = false,
}: {
  delta: ComparisonDelta;
  invert?: boolean;
  accent?: boolean;
}) {
  if (delta.pct === null) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold",
          accent ? "bg-white/15 text-current" : "bg-zinc-100 text-zinc-600",
        )}
      >
        <Minus className="size-3" strokeWidth={2.25} />
        sin datos previos
      </span>
    );
  }
  const rounded = Math.round(delta.pct);
  const positive = rounded > 0;
  const negative = rounded < 0;
  const sign = positive ? "+" : "";
  const isGood = invert ? negative : positive;
  const isBad = invert ? positive : negative;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold",
        !accent && isGood && "bg-emerald-50 text-emerald-700",
        !accent && isBad && "bg-rose-50 text-rose-700",
        !accent && rounded === 0 && "bg-zinc-100 text-zinc-600",
        accent && "bg-white/15 text-current",
      )}
    >
      {positive ? (
        <TrendingUp className="size-3" strokeWidth={2.25} />
      ) : negative ? (
        <TrendingDown className="size-3" strokeWidth={2.25} />
      ) : (
        <Minus className="size-3" strokeWidth={2.25} />
      )}
      {sign}
      {rounded}% vs período anterior
    </span>
  );
}

function Card({
  label,
  value,
  hint,
  delta,
  invertDelta,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: ComparisonDelta;
  invertDelta?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? "flex flex-col justify-between gap-5 rounded-2xl p-5 ring-1"
          : "flex flex-col justify-between gap-5 rounded-2xl bg-white p-5 ring-1 ring-zinc-200/70 transition hover:ring-zinc-300"
      }
      style={
        accent
          ? {
              background: "var(--brand)",
              color: "var(--brand-foreground)",
              boxShadow: "0 18px 36px -22px var(--brand)",
            }
          : undefined
      }
    >
      <p
        className={
          accent
            ? "text-[0.65rem] font-semibold uppercase tracking-[0.14em] opacity-80"
            : "text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500"
        }
      >
        {label}
      </p>
      <div>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {delta ? (
            <DeltaBadge delta={delta} invert={invertDelta} accent={accent} />
          ) : null}
          {hint ? (
            <span
              className={cn(
                "text-xs",
                accent ? "opacity-80" : "text-zinc-500",
              )}
            >
              {hint}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function SummaryCards({
  summary,
  comparison,
}: {
  summary: ReportSummary;
  comparison: ReportComparison;
}) {
  const totalActive = summary.orderCount;
  const totalAll = totalActive + summary.cancelledCount;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
      <Card
        label="Ingresos"
        value={formatCurrency(summary.revenueCents)}
        delta={comparison.revenueCents}
        accent
      />
      <Card
        label="Pedidos"
        value={summary.orderCount.toString()}
        hint={`Ticket prom. ${formatCurrency(summary.averageTicketCents)}`}
        delta={comparison.orderCount}
      />
      <Card
        label="Ticket promedio"
        value={formatCurrency(summary.averageTicketCents)}
        delta={comparison.averageTicketCents}
      />
      <Card
        label="Cancelados"
        value={summary.cancelledCount.toString()}
        hint={`${pct(summary.cancelledCount, totalAll)} del total`}
        delta={comparison.cancelledCount}
        invertDelta
      />
    </div>
  );
}
