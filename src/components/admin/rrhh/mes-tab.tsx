"use client";

import { Clock, Calendar, TrendingUp, Trophy, Users } from "lucide-react";

import type {
  MonthlyOverview,
  MonthlySummaryRow,
} from "@/lib/rrhh/clock-queries";
import { ROLE_META } from "@/lib/admin/roles";
import type { BusinessRoleInput } from "@/lib/admin/roles";
import { cn } from "@/lib/utils";

function formatHours(minutes: number): string {
  if (minutes === 0) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatHoursDecimal(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
  });
}

function formatMonthName(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
}

function relativeDate(iso: string): string {
  const now = new Date();
  const date = new Date(iso);
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return formatDateShort(iso);
}

export function MesEnCursoTab({ overview }: { overview: MonthlyOverview }) {
  const monthName = formatMonthName(overview.rangeStart);
  const topPerformer = overview.perEmployee[0];
  const avgMinutesPerEmployee =
    overview.activeEmployees > 0
      ? Math.round(overview.totalMinutes / overview.activeEmployees)
      : 0;

  return (
    <div className="space-y-8">
      {/* Title */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Mes en curso
        </p>
        <h2 className="mt-1 text-2xl font-bold capitalize text-zinc-900">
          {monthName}
        </h2>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Clock className="size-5" />}
          label="Horas trabajadas"
          value={formatHoursDecimal(overview.totalMinutes)}
          sub={`${overview.daysWithActivity} ${overview.daysWithActivity === 1 ? "día" : "días"} con actividad`}
          accent="bg-emerald-50 text-emerald-600 ring-emerald-100"
        />
        <KpiCard
          icon={<Users className="size-5" />}
          label="Empleados activos"
          value={String(overview.activeEmployees)}
          sub="ficharon al menos una vez"
          accent="bg-blue-50 text-blue-600 ring-blue-100"
        />
        <KpiCard
          icon={<TrendingUp className="size-5" />}
          label="Promedio por persona"
          value={formatHoursDecimal(avgMinutesPerEmployee)}
          sub="horas totales / empleado"
          accent="bg-violet-50 text-violet-600 ring-violet-100"
        />
        <KpiCard
          icon={<Trophy className="size-5" />}
          label="Top del mes"
          value={topPerformer?.name ?? "—"}
          sub={
            topPerformer
              ? `${formatHoursDecimal(topPerformer.totalMinutes)} en ${topPerformer.daysWorked} ${topPerformer.daysWorked === 1 ? "día" : "días"}`
              : "sin datos"
          }
          accent="bg-amber-50 text-amber-600 ring-amber-100"
          valueSize="lg"
        />
      </div>

      {/* Daily activity chart */}
      {overview.dailyTotals.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">
              Actividad diaria
            </h3>
            <p className="text-xs text-zinc-500">Total de horas por día</p>
          </div>
          <DailyChart data={overview.dailyTotals} />
        </section>
      )}

      {/* Per-employee table */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">
            Detalle por empleado
          </h3>
          <p className="text-xs text-zinc-500">
            Ordenado por horas trabajadas
          </p>
        </div>
        {overview.perEmployee.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-12 text-center">
            <Calendar className="mx-auto size-8 text-zinc-300" />
            <p className="mt-3 text-sm font-medium text-zinc-600">
              Sin fichadas este mes
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Los empleados aún no fueron registrados.
            </p>
          </div>
        ) : (
          <EmployeeTable rows={overview.perEmployee} />
        )}
      </section>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
  valueSize = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  accent: string;
  valueSize?: "default" | "lg";
}) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200/60">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </p>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-xl ring-1",
            accent,
          )}
        >
          {icon}
        </span>
      </div>
      <p
        className={cn(
          "mt-3 truncate font-bold tabular-nums text-zinc-900",
          valueSize === "lg" ? "text-xl" : "text-3xl",
        )}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-xs text-zinc-500">{sub}</p>
    </div>
  );
}

function DailyChart({
  data,
}: {
  data: { date: string; totalMinutes: number; employeesCount: number }[];
}) {
  const maxMinutes = Math.max(...data.map((d) => d.totalMinutes), 1);

  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200/60">
      <div className="flex h-40 items-end gap-1.5">
        {data.map((d) => {
          const heightPct = (d.totalMinutes / maxMinutes) * 100;
          return (
            <div
              key={d.date}
              className="group relative flex flex-1 flex-col items-center"
            >
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-emerald-400 to-emerald-300 transition-all hover:from-emerald-500 hover:to-emerald-400"
                style={{ height: `${heightPct}%`, minHeight: "4px" }}
              />
              {/* Tooltip on hover */}
              <div className="pointer-events-none absolute bottom-full mb-2 hidden whitespace-nowrap rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block">
                <p className="font-semibold">{formatDateShort(d.date)}</p>
                <p className="text-zinc-300">
                  {formatHours(d.totalMinutes)} ·{" "}
                  {d.employeesCount}{" "}
                  {d.employeesCount === 1 ? "persona" : "personas"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between text-[0.65rem] font-medium text-zinc-400">
        <span>{formatDateShort(data[0].date)}</span>
        {data.length > 1 && (
          <span>{formatDateShort(data[data.length - 1].date)}</span>
        )}
      </div>
    </div>
  );
}

function EmployeeTable({ rows }: { rows: MonthlySummaryRow[] }) {
  const maxMinutes = Math.max(...rows.map((r) => r.totalMinutes), 1);

  return (
    <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200/60">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100 bg-zinc-50/60 text-left text-[0.7rem] font-semibold uppercase tracking-wider text-zinc-500">
            <th className="px-5 py-3">Empleado</th>
            <th className="px-5 py-3">Rol</th>
            <th className="px-5 py-3 text-right">Horas mes</th>
            <th className="px-5 py-3 text-right">Días</th>
            <th className="px-5 py-3 text-right">Prom/día</th>
            <th className="px-5 py-3 text-right">Última</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row, idx) => {
            const pct = (row.totalMinutes / maxMinutes) * 100;
            const isTop = idx === 0;
            return (
              <tr
                key={row.userId}
                className="group transition-colors hover:bg-zinc-50/60"
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    {isTop && (
                      <Trophy className="size-3.5 shrink-0 text-amber-500" />
                    )}
                    <span className="truncate font-medium text-zinc-900">
                      {row.name}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full px-2 py-0.5 text-[0.7rem] font-semibold capitalize",
                      roleBadgeStyle(row.role),
                    )}
                  >
                    {ROLE_META[row.role as BusinessRoleInput]?.label ??
                      row.role}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100 sm:block">
                      <div
                        className="h-full rounded-full bg-emerald-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-16 tabular-nums font-semibold text-zinc-900">
                      {formatHours(row.totalMinutes)}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-zinc-600">
                  {row.daysWorked}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-zinc-600">
                  {formatHours(row.avgMinutesPerDay)}
                </td>
                <td className="px-5 py-3 text-right text-xs text-zinc-500">
                  {row.lastClockIn ? relativeDate(row.lastClockIn) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function roleBadgeStyle(role: string): string {
  switch (role) {
    case "admin":
      return "bg-violet-50 text-violet-700 ring-1 ring-violet-200";
    case "encargado":
      return "bg-blue-50 text-blue-700 ring-1 ring-blue-200";
    case "mozo":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    case "personal":
      return "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200";
    default:
      return "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200";
  }
}
