import { Truck } from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import type { SupplierOutflowItem } from "@/lib/proveedores/types";

export function SupplierOutflowSection({
  data,
}: {
  data: SupplierOutflowItem[];
}) {
  if (data.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
        <header className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
            <Truck className="size-4" strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Proveedores
            </p>
            <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
              Salida de productos
            </h2>
          </div>
        </header>
        <p className="mt-5 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-6 text-center text-sm italic text-zinc-500">
          Sin datos de salida en este período. Vinculá proveedores a insumos
          desde el panel de proveedores.
        </p>
      </section>
    );
  }

  const maxCost = Math.max(1, ...data.map((d) => d.totalCostCents));

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
      <header className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
          <Truck className="size-4" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Proveedores
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
            Salida estimada por proveedor
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Costo de insumos vendidos asociados a cada proveedor
          </p>
        </div>
      </header>

      <div className="mt-5 space-y-3">
        {data.map((d) => {
          const widthPct = (d.totalCostCents / maxCost) * 100;
          return (
            <div key={d.supplierId} className="rounded-xl bg-zinc-50 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-zinc-900">
                  {d.supplierName}
                </span>
                <span className="text-sm font-semibold tabular-nums text-zinc-900">
                  {formatCurrency(d.totalCostCents)}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/70">
                <div
                  className="h-full rounded-full bg-zinc-900 transition-all duration-700"
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <p className="mt-1.5 text-[0.7rem] text-zinc-500">
                {d.consumptionCount} consumos de insumos
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
