"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ReservationFunnel } from "@/lib/admin/reports-query";

const SHORT_MD = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
});

export function ReservationFunnelSection({
  data,
}: {
  data: ReservationFunnel;
}) {
  const chartData = useMemo(
    () =>
      data.weekly.map((w) => ({
        ...w,
        short: SHORT_MD.format(new Date(`${w.weekStart}T12:00:00Z`)),
      })),
    [data.weekly],
  );

  const stages = [
    {
      key: "confirmed",
      label: "Confirmadas",
      value: data.confirmed + data.seated + data.completed + data.noShow,
      color: "#3b82f6",
    },
    {
      key: "seated",
      label: "Sentadas",
      value: data.seated + data.completed,
      color: "#8b5cf6",
    },
    {
      key: "completed",
      label: "Atendidas",
      value: data.completed,
      color: "#10b981",
    },
  ];
  const max = Math.max(1, ...stages.map((s) => s.value));

  const channels = [
    { key: "web", label: "Web", value: data.byChannel.web },
    { key: "chatbot", label: "Chatbot", value: data.byChannel.chatbot },
    { key: "admin", label: "Mostrador", value: data.byChannel.admin },
  ].filter((c) => c.value > 0);

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Reservas
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Funnel del período
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">
            {data.total} reservas · tasa de asistencia{" "}
            <span className="font-semibold text-emerald-600">
              {data.attendanceRate.toFixed(0)}%
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-rose-600">
              No-show
            </p>
            <p className="text-lg font-semibold tabular-nums text-zinc-900">
              {data.noShow}
            </p>
          </div>
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Canceladas
            </p>
            <p className="text-lg font-semibold tabular-nums text-zinc-900">
              {data.cancelled}
            </p>
          </div>
        </div>
      </header>

      <div className="mt-5 space-y-2.5">
        {stages.map((s) => {
          const widthPct = (s.value / max) * 100;
          return (
            <div key={s.key} className="grid gap-1">
              <div className="flex items-baseline justify-between text-sm">
                <span className="flex items-center gap-2 font-medium text-zinc-900">
                  <span
                    className="size-2.5 rounded-sm"
                    style={{ background: s.color }}
                  />
                  {s.label}
                </span>
                <span className="font-semibold tabular-nums text-zinc-900">
                  {s.value}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${widthPct}%`, background: s.color }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {channels.length > 0 ? (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Por canal
          </span>
          {channels.map((c) => (
            <span
              key={c.key}
              className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 tabular-nums"
            >
              {c.label} <span className="font-semibold text-zinc-900">{c.value}</span>
            </span>
          ))}
        </div>
      ) : null}

      {chartData.length > 0 ? (
        <div className="mt-6 h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f4f4f5" />
              <XAxis
                dataKey="short"
                tick={{ fill: "#a1a1aa", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fill: "#a1a1aa", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip cursor={{ fill: "#f4f4f5" }} />
              <Legend
                iconType="square"
                wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              />
              <Bar
                dataKey="completed"
                stackId="r"
                fill="#10b981"
                name="Atendidas"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="noShow"
                stackId="r"
                fill="#f43f5e"
                name="No-show"
                radius={[4, 4, 0, 0]}
              />
              <Bar
                dataKey="cancelled"
                stackId="r"
                fill="#a1a1aa"
                name="Canceladas"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </section>
  );
}
