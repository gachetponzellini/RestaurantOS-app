"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "@/lib/currency";

// Paleta por local (House, Golf, …). El total va en negro punteado.
export const LOCAL_PALETTE = [
  "#6366f1",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#0ea5e9",
];

const SHORT_MD = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
});

function compactCurrency(cents: number): string {
  const v = cents / 100;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${Math.round(v)}`;
}

export type LocalSeries = { id: string; name: string };
export type DayRow = { date: string; total: number; perLocal: Record<string, number> };

export function MisLocalesRevenueChart({
  locales,
  rows,
}: {
  locales: LocalSeries[];
  rows: DayRow[];
}) {
  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        short: SHORT_MD.format(new Date(`${r.date}T12:00:00Z`)),
        total: r.total,
        ...r.perLocal,
      })),
    [rows],
  );

  const max = Math.max(1, ...chartData.map((d) => d.total));
  const tickEvery = Math.max(1, Math.ceil(chartData.length / 8));

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
      <header>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Ingresos por día
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
          Comparación de locales
        </h2>
      </header>

      <div className="mt-6 h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
          >
            <CartesianGrid vertical={false} stroke="#f4f4f5" />
            <XAxis
              dataKey="short"
              interval={tickEvery - 1}
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              dy={6}
            />
            <YAxis
              domain={[0, max * 1.15]}
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => compactCurrency(v)}
              width={64}
            />
            <Tooltip
              formatter={(value) => formatCurrency(Number(value))}
              cursor={{ stroke: "#d4d4d8", strokeWidth: 1 }}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #e4e4e7",
                fontSize: 12,
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              iconType="plainline"
            />
            <Line
              dataKey="total"
              name="Total"
              stroke="#18181b"
              strokeWidth={2}
              strokeDasharray="4 3"
              dot={false}
            />
            {locales.map((l, i) => (
              <Line
                key={l.id}
                dataKey={l.id}
                name={l.name}
                stroke={LOCAL_PALETTE[i % LOCAL_PALETTE.length]}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
