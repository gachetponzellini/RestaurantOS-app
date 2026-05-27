"use client";

import { AlertTriangle, FileCheck, Receipt, TrendingUp } from "lucide-react";

import type { InvoiceKPIs } from "@/lib/afip/queries";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

type Props = {
  kpis: InvoiceKPIs;
  onFilterFailed?: () => void;
};

export function InvoiceKpiStrip({ kpis, onFilterFailed }: Props) {
  const total = kpis.countA + kpis.countB;
  const pctB = total > 0 ? Math.round((kpis.countB / total) * 100) : 0;
  const pctA = total > 0 ? 100 - pctB : 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        icon={<TrendingUp className="size-4" />}
        label="Facturado"
        value={formatCurrency(kpis.totalCents)}
        accent="brand"
      />
      <KpiCard
        icon={<FileCheck className="size-4" />}
        label="Comprobantes"
        value={String(kpis.count)}
      />
      <KpiCard
        icon={<Receipt className="size-4" />}
        label="Tipo"
        value={total > 0 ? `${pctB}% B · ${pctA}% A` : "—"}
      />
      <KpiCard
        icon={<AlertTriangle className="size-4" />}
        label="Fallidos"
        value={String(kpis.countFailed)}
        accent={kpis.countFailed > 0 ? "rose" : undefined}
        onClick={kpis.countFailed > 0 ? onFilterFailed : undefined}
      />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: "brand" | "rose";
  onClick?: () => void;
}) {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        "flex flex-col gap-1 rounded-2xl bg-white p-4 ring-1 ring-zinc-200/70 transition",
        onClick && "cursor-pointer hover:ring-zinc-300",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "text-zinc-400",
            accent === "brand" && "text-[var(--brand)]",
            accent === "rose" && "text-rose-500",
          )}
        >
          {icon}
        </span>
        <span className="text-xs font-medium text-zinc-500">{label}</span>
      </div>
      <p
        className={cn(
          "text-xl font-semibold tabular-nums tracking-tight text-zinc-900",
          accent === "rose" && "text-rose-600",
        )}
      >
        {value}
      </p>
    </Wrapper>
  );
}
