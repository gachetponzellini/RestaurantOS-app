"use client";

import { useState, useTransition } from "react";
import { CalendarRange, Info, TrendingDown } from "lucide-react";
import { toast } from "sonner";

import { fetchMermaReport } from "@/lib/ingredients/actions";
import type { MermaReportItem } from "@/lib/ingredients/merma";
import type { IngredientUnit } from "@/lib/ingredients/types";

function fmtQty(qty: number, unit: IngredientUnit): string {
  const n = unit === "un" ? qty.toFixed(0) : qty.toFixed(2);
  return `${n} ${unit}`;
}

export function MermaTab({
  slug,
  initialReport,
  initialFrom,
  initialTo,
}: {
  slug: string;
  initialReport: MermaReportItem[];
  initialFrom: string;
  initialTo: string;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [report, setReport] = useState(initialReport);
  const [pending, startTransition] = useTransition();

  function applyRange() {
    if (from > to) {
      toast.error("La fecha de inicio no puede ser posterior a la de fin.");
      return;
    }
    startTransition(async () => {
      const r = await fetchMermaReport(slug, from, to);
      if (r.ok) setReport(r.data);
      else toast.error(r.error);
    });
  }

  return (
    <div className="space-y-4">
      {/* Filtros de período */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Desde
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="block h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Hasta
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="block h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
          />
        </div>
        <button
          type="button"
          onClick={applyRange}
          disabled={pending}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
        >
          <CalendarRange className="size-4" />
          {pending ? "Calculando…" : "Aplicar"}
        </button>
      </div>

      {/* Aclaración: reporte estimativo */}
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-200">
        <Info className="mt-0.5 size-4 shrink-0" />
        <p>
          Reporte <strong>estimativo</strong>: cruza lo que entró (compras) contra
          lo que salió (ventas + merma cargada) y estima la merma teórica según el{" "}
          <em>% de merma</em> de cada insumo. No es un inventario contable.
        </p>
      </div>

      {/* Tabla */}
      {report.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 py-16 text-center text-zinc-400">
          <TrendingDown className="size-10 opacity-40" />
          <p className="text-sm">No hay movimientos de insumos en este período.</p>
        </div>
      ) : (
        <div className="overflow-auto rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/70 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3">Insumo</th>
                <th className="px-4 py-3 text-right">% merma</th>
                <th className="px-4 py-3 text-right">Entró</th>
                <th className="px-4 py-3 text-right">Salió</th>
                <th className="px-4 py-3 text-right">Merma estimada</th>
                <th className="px-4 py-3 text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {report.map((item) => (
                <tr key={item.ingredientId} className="transition hover:bg-zinc-50/50">
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {item.ingredientName}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-500">
                    {item.wastePercent}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
                    {fmtQty(item.enteredQty, item.ingredientUnit)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-700">
                    {fmtQty(item.exitedQty, item.ingredientUnit)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-amber-700">
                    {fmtQty(item.mermaEstimadaQty, item.ingredientUnit)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-zinc-900">
                    {fmtQty(item.diffQty, item.ingredientUnit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
