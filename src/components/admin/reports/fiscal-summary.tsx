import { AlertTriangle, FileCheck2, Receipt } from "lucide-react";

import { formatCurrency } from "@/lib/currency";
import type { FiscalSummary } from "@/lib/admin/reports-extra-query";

export function FiscalSummarySection({ data }: { data: FiscalSummary }) {
  const ratePct = data.invoicedRatePct;
  const hasAlerts = data.pendingCount > 0 || data.failedCount > 0;

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
      <header className="flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
          <Receipt className="size-4" strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Fiscal · AFIP
          </p>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
            Facturación
          </h2>
        </div>
      </header>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-zinc-50 p-3">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Facturado
          </dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">
            {formatCurrency(data.invoicedCents)}
          </dd>
          <dd className="text-[0.7rem] text-zinc-500">
            {data.authorizedCount} comprobantes
          </dd>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            IVA generado
          </dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">
            {formatCurrency(data.ivaCents)}
          </dd>
        </div>
        <div className="rounded-xl bg-zinc-50 p-3">
          <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            % facturado
          </dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums text-zinc-900">
            {ratePct === null ? "—" : `${ratePct.toFixed(0)}%`}
          </dd>
          <dd className="text-[0.7rem] text-zinc-500">sobre ventas</dd>
        </div>
      </dl>

      {hasAlerts ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          <p>
            {data.pendingCount > 0 ? (
              <span className="font-semibold">
                {data.pendingCount} pendientes
              </span>
            ) : null}
            {data.pendingCount > 0 && data.failedCount > 0 ? " · " : null}
            {data.failedCount > 0 ? (
              <span className="font-semibold">{data.failedCount} fallidas</span>
            ) : null}{" "}
            de autorizar en AFIP. Revisalas para no perder respaldo fiscal.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-sm text-emerald-800">
          <FileCheck2 className="size-4 shrink-0" strokeWidth={2} />
          <p>Todos los comprobantes del período están autorizados.</p>
        </div>
      )}
    </section>
  );
}
