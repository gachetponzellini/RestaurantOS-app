import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Clock,
  LayoutGrid,
  ShoppingBag,
  TrendingUp,
  Receipt,
  Users,
  XCircle,
} from "lucide-react";

import {
  LOCAL_PALETTE,
  MisLocalesRevenueChart,
  type DayRow,
} from "@/components/owner/mis-locales-revenue-chart";
import { RangePills } from "@/components/owner/range-pills";
import { formatCurrency } from "@/lib/currency";
import {
  REPORT_RANGES,
  type ReportRange,
  type ReportRangeInput,
} from "@/lib/admin/reports-query";
import { buildAlerts } from "@/lib/owner/alerts";
import { getMisLocalesData } from "@/lib/platform/queries";

function pctLabel(pct: number | null): { text: string; up: boolean } | null {
  if (pct === null) return null;
  const up = pct >= 0;
  return { text: `${up ? "+" : ""}${pct.toFixed(0)}%`, up };
}

export default async function MisLocalesPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rawRange } = await searchParams;
  const preset: ReportRange = (REPORT_RANGES as readonly string[]).includes(
    rawRange ?? "",
  )
    ? (rawRange as ReportRange)
    : "30d";
  const rangeInput: ReportRangeInput = preset;

  const data = await getMisLocalesData(rangeInput);
  if (!data) redirect("/login");

  const { locales, totals, comparison, topProducts, sharedCustomers } = data;

  const alerts = buildAlerts(
    locales.map((r) => ({
      name: r.local.name,
      revenuePct: r.data.comparison.revenueCents.pct,
      kitchenAvgMin: r.data.prepTimes.averageMinutes,
      kitchenSample: r.data.prepTimes.sampleSize,
      noShow: r.data.reservationFunnel?.noShow ?? 0,
      attendanceRate: r.data.reservationFunnel?.attendanceRate ?? null,
      reservationsFinalized: r.data.reservationFunnel
        ? r.data.reservationFunnel.completed + r.data.reservationFunnel.noShow
        : 0,
    })),
  );

  // Serie comparada: una columna por local + total, por día.
  const dateSet = new Set<string>();
  for (const r of locales) for (const d of r.data.revenueByDay) dateSet.add(d.date);
  const dates = [...dateSet].sort();
  const revenueByLocal = locales.map((r) => ({
    id: r.local.id,
    map: new Map(r.data.revenueByDay.map((d) => [d.date, d.revenueCents])),
  }));
  const rows: DayRow[] = dates.map((date) => {
    const perLocal: Record<string, number> = {};
    let total = 0;
    for (const l of revenueByLocal) {
      const v = l.map.get(date) ?? 0;
      perLocal[l.id] = v;
      total += v;
    }
    return { date, total, perLocal };
  });

  const channelTotal =
    totals.deliveryCount + totals.pickupCount + totals.dineInCount;
  const channels = [
    { label: "Salón", value: totals.dineInCount },
    { label: "Delivery", value: totals.deliveryCount },
    { label: "Take-away", value: totals.pickupCount },
  ];

  const kpis = [
    {
      label: "Ingresos",
      value: formatCurrency(totals.revenueCents),
      delta: pctLabel(comparison.revenueCents.pct),
      icon: <TrendingUp className="size-4" strokeWidth={1.75} />,
      accent: true,
    },
    {
      label: "Pedidos",
      value: totals.orderCount.toString(),
      delta: pctLabel(comparison.orderCount.pct),
      icon: <ShoppingBag className="size-4" strokeWidth={1.75} />,
    },
    {
      label: "Ticket promedio",
      value: formatCurrency(totals.averageTicketCents),
      delta: pctLabel(comparison.averageTicketCents.pct),
      icon: <Receipt className="size-4" strokeWidth={1.75} />,
    },
    {
      label: "Cancelados",
      value: totals.cancelledCount.toString(),
      delta: null,
      icon: <XCircle className="size-4" strokeWidth={1.75} />,
    },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl space-y-10 px-4 py-10 sm:px-6 lg:px-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Mis locales
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
            Panorama
          </h1>
          <p className="mt-2 max-w-xl text-sm text-zinc-600">
            Métricas comparadas de tus {locales.length} locales.
          </p>
        </div>
        <RangePills basePath="/mis-locales" active={preset} />
      </header>

      {/* ── Alertas automáticas ──────────────────────────────────────── */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div
              key={`${a.kind}-${a.localName}-${i}`}
              className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
            >
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-amber-600"
                strokeWidth={2}
              />
              <p className="text-sm text-amber-900">{a.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Pulso del complejo ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((c) => (
          <div
            key={c.label}
            className={
              c.accent
                ? "flex flex-col justify-between gap-6 rounded-2xl bg-zinc-900 p-5 text-zinc-50 ring-1 ring-zinc-900"
                : "flex flex-col justify-between gap-6 rounded-2xl bg-white p-5 ring-1 ring-zinc-200/70"
            }
          >
            <div className="flex items-start justify-between gap-3">
              <span
                className={
                  "text-[0.65rem] font-semibold uppercase tracking-[0.14em] " +
                  (c.accent ? "text-zinc-400" : "text-zinc-500")
                }
              >
                {c.label}
              </span>
              <span
                className={
                  "flex size-8 shrink-0 items-center justify-center rounded-xl " +
                  (c.accent ? "bg-white/10 text-white" : "bg-zinc-100 text-zinc-700")
                }
              >
                {c.icon}
              </span>
            </div>
            <div>
              <div className="text-3xl font-semibold tracking-tight tabular-nums">
                {c.value}
              </div>
              {c.delta ? (
                <div
                  className={
                    "mt-1.5 text-xs font-semibold tabular-nums " +
                    (c.delta.up ? "text-emerald-500" : "text-red-500")
                  }
                >
                  {c.delta.text}{" "}
                  <span
                    className={c.accent ? "text-zinc-400" : "text-zinc-400"}
                  >
                    vs período anterior
                  </span>
                </div>
              ) : (
                <div
                  className={
                    "mt-1.5 text-xs " + (c.accent ? "text-zinc-400" : "text-zinc-500")
                  }
                >
                  en el período
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Ingresos comparados ──────────────────────────────────────── */}
      <MisLocalesRevenueChart
        locales={locales.map((r) => ({ id: r.local.id, name: r.local.name }))}
        rows={rows}
      />

      {/* ── KPIs lado a lado + split % ───────────────────────────────── */}
      <section className="space-y-5">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Comparación
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            Detalle por local
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locales.map((r, i) => {
            const s = r.data.summary;
            const share =
              totals.revenueCents > 0
                ? Math.round((s.revenueCents / totals.revenueCents) * 100)
                : 0;
            const rev = pctLabel(r.data.comparison.revenueCents.pct);
            return (
              <Link
                key={r.local.id}
                href={`/${r.local.slug}/admin`}
                className="group flex flex-col gap-4 rounded-2xl bg-white p-5 ring-1 ring-zinc-200/70 transition hover:ring-zinc-300"
              >
                <header className="flex items-center gap-3">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{
                      background: LOCAL_PALETTE[i % LOCAL_PALETTE.length],
                    }}
                  />
                  <h3 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-zinc-900">
                    {r.local.name}
                  </h3>
                  <span className="text-xs font-semibold tabular-nums text-zinc-500">
                    {share}%
                  </span>
                </header>

                <div className="flex items-end justify-between">
                  <div className="text-2xl font-semibold tabular-nums text-zinc-900">
                    {formatCurrency(s.revenueCents)}
                  </div>
                  {rev ? (
                    <span
                      className={
                        "text-xs font-semibold tabular-nums " +
                        (rev.up ? "text-emerald-600" : "text-red-500")
                      }
                    >
                      {rev.text}
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-zinc-100 pt-3 text-sm">
                  <div>
                    <div className="font-semibold tabular-nums text-zinc-900">
                      {s.orderCount}
                    </div>
                    <div className="text-[0.65rem] text-zinc-500">pedidos</div>
                  </div>
                  <div>
                    <div className="font-semibold tabular-nums text-zinc-900">
                      {formatCurrency(s.averageTicketCents)}
                    </div>
                    <div className="text-[0.65rem] text-zinc-500">ticket prom.</div>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-900">
                    Entrar al panel
                    <span className="flex size-6 items-center justify-center rounded-full bg-zinc-900 text-zinc-50 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5">
                      <ArrowUpRight className="size-3" />
                    </span>
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Mix de canal + Top productos ─────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Mix de canal
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            De dónde vienen los pedidos
          </h2>
          <div className="mt-5 space-y-3">
            {channels.map((c) => {
              const pct =
                channelTotal > 0 ? Math.round((c.value / channelTotal) * 100) : 0;
              return (
                <div key={c.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-700">{c.label}</span>
                    <span className="font-semibold tabular-nums text-zinc-900">
                      {c.value}{" "}
                      <span className="text-zinc-400">· {pct}%</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-zinc-900"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Top productos
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Más vendidos del grupo
          </h2>
          <ol className="mt-5 space-y-2.5">
            {topProducts.length === 0 ? (
              <li className="text-sm text-zinc-500">Sin ventas en el período.</li>
            ) : (
              topProducts.slice(0, 8).map((p, i) => (
                <li
                  key={p.product_name}
                  className="flex items-center gap-3 text-sm"
                >
                  <span className="w-4 text-right font-semibold tabular-nums text-zinc-400">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-zinc-800">
                    {p.product_name}
                  </span>
                  <span className="font-semibold tabular-nums text-zinc-900">
                    {p.quantity}
                  </span>
                  <span className="w-24 text-right tabular-nums text-zinc-500">
                    {formatCurrency(p.revenueCents)}
                  </span>
                </li>
              ))
            )}
          </ol>
        </div>
      </section>

      {/* ── Salud operativa ──────────────────────────────────────────── */}
      <section className="space-y-5">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Salud operativa
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            Cocina, reservas y salón
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {locales.map((r, i) => {
            const prep = r.data.prepTimes;
            const funnel = r.data.reservationFunnel;
            return (
              <div
                key={r.local.id}
                className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200/70"
              >
                <header className="flex items-center gap-2.5">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: LOCAL_PALETTE[i % LOCAL_PALETTE.length] }}
                  />
                  <h3 className="truncate text-base font-semibold tracking-tight text-zinc-900">
                    {r.local.name}
                  </h3>
                </header>

                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-zinc-600">
                      <Clock className="size-4 text-zinc-400" strokeWidth={1.75} />
                      Cocina (prom.)
                    </dt>
                    <dd className="font-semibold tabular-nums text-zinc-900">
                      {prep.sampleSize > 0
                        ? `${Math.round(prep.averageMinutes)} min`
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-zinc-600">
                      <XCircle className="size-4 text-zinc-400" strokeWidth={1.75} />
                      No-shows
                    </dt>
                    <dd className="font-semibold tabular-nums text-zinc-900">
                      {funnel
                        ? `${funnel.noShow} · ${Math.round(funnel.attendanceRate)}% asist.`
                        : "sin reservas"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="flex items-center gap-2 text-zinc-600">
                      <LayoutGrid
                        className="size-4 text-zinc-400"
                        strokeWidth={1.75}
                      />
                      Salón ahora
                    </dt>
                    <dd className="font-semibold tabular-nums text-zinc-900">
                      {r.salon.openTables}/{r.salon.totalTables} mesas
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Clientes compartidos ─────────────────────────────────────── */}
      <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Clientes compartidos
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
              Compran en más de un local
            </h2>
          </div>
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700">
            <Users className="size-5" strokeWidth={1.75} />
          </div>
        </div>

        <p className="mt-4 text-sm text-zinc-600">
          <span className="text-2xl font-semibold tabular-nums text-zinc-900">
            {sharedCustomers.sharedCount}
          </span>{" "}
          de {sharedCustomers.uniqueCount} clientes del período visitaron 2+
          locales.
        </p>

        {sharedCustomers.top.length > 0 && (
          <ul className="mt-5 space-y-2.5">
            {sharedCustomers.top.map((c) => (
              <li
                key={`${c.name}-${c.phone}`}
                className="flex items-center gap-3 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-zinc-800">
                  {c.name}
                </span>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[0.65rem] font-semibold text-zinc-600">
                  {c.localesCount} locales
                </span>
                <span className="w-12 text-right tabular-nums text-zinc-500">
                  {c.orderCount} ped.
                </span>
                <span className="w-24 text-right font-semibold tabular-nums text-zinc-900">
                  {formatCurrency(c.revenueCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export const dynamic = "force-dynamic";
