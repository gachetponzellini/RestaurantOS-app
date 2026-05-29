"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { formatCurrency } from "@/lib/currency";
import type {
  MenuEngineering,
  MenuQuadrant,
} from "@/lib/admin/profit-query";

const QUADRANT_META: Record<
  MenuQuadrant,
  { label: string; tag: string; color: string; chip: string }
> = {
  estrella: {
    label: "Estrellas",
    tag: "popular + rentable",
    color: "#10b981",
    chip: "bg-emerald-50 text-emerald-700",
  },
  vaca: {
    label: "Vacas lecheras",
    tag: "popular + margen bajo",
    color: "#f59e0b",
    chip: "bg-amber-50 text-amber-700",
  },
  puzzle: {
    label: "Puzzles",
    tag: "rentable pero poco vendido",
    color: "#6366f1",
    chip: "bg-indigo-50 text-indigo-700",
  },
  perro: {
    label: "Perros",
    tag: "poco vendido + margen bajo",
    color: "#f43f5e",
    chip: "bg-rose-50 text-rose-700",
  },
};

const QUADRANT_ORDER: MenuQuadrant[] = ["estrella", "vaca", "puzzle", "perro"];

type Point = {
  x: number;
  y: number;
  name: string;
  quadrant: MenuQuadrant;
  units: number;
  marginPct: number;
  revenueCents: number;
};

export function MenuEngineeringSection({ data }: { data: MenuEngineering }) {
  const points = useMemo<Point[]>(
    () =>
      data.items.map((it) => ({
        x: it.unitsSold,
        y: it.marginPercent,
        name: it.productName,
        quadrant: it.quadrant,
        units: it.unitsSold,
        marginPct: it.marginPercent,
        revenueCents: it.revenueCents,
      })),
    [data.items],
  );

  const counts = useMemo(() => {
    const c: Record<MenuQuadrant, number> = {
      estrella: 0,
      vaca: 0,
      puzzle: 0,
      perro: 0,
    };
    for (const it of data.items) c[it.quadrant] += 1;
    return c;
  }, [data.items]);

  if (data.items.length === 0) {
    return (
      <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
        <header>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Ingeniería de menú
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Popularidad × rentabilidad
          </h2>
        </header>
        <p className="mt-6 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-6 text-center text-sm italic text-zinc-500">
          Necesitás productos con receta cargada y ventas en el período para
          clasificar el menú.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Ingeniería de menú
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Popularidad × rentabilidad
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {data.items.length} productos con receta · promedio{" "}
            {data.avgUnits.toFixed(0)} u. y {data.avgMarginPct.toFixed(0)}% margen
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUADRANT_ORDER.map((q) => (
            <span
              key={q}
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ${QUADRANT_META[q].chip}`}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: QUADRANT_META[q].color }}
              />
              {QUADRANT_META[q].label} · {counts[q]}
            </span>
          ))}
        </div>
      </header>

      <div className="mt-5 h-[340px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 16, bottom: 28, left: 8 }}>
            <CartesianGrid stroke="#f4f4f5" />
            <XAxis
              type="number"
              dataKey="x"
              name="Unidades"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              label={{
                value: "Unidades vendidas",
                position: "insideBottom",
                offset: -16,
                fill: "#71717a",
                fontSize: 11,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Margen"
              unit="%"
              tick={{ fill: "#a1a1aa", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              label={{
                value: "Margen %",
                angle: -90,
                position: "insideLeft",
                fill: "#71717a",
                fontSize: 11,
              }}
            />
            <ZAxis type="number" dataKey="revenueCents" range={[60, 400]} />
            <ReferenceLine
              x={data.avgUnits}
              stroke="#d4d4d8"
              strokeDasharray="4 4"
            />
            <ReferenceLine
              y={data.avgMarginPct}
              stroke="#d4d4d8"
              strokeDasharray="4 4"
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as Point;
                return (
                  <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm">
                    <p className="font-semibold text-zinc-900">{p.name}</p>
                    <p className="text-zinc-500">
                      {p.units} u. · {p.marginPct.toFixed(0)}% margen
                    </p>
                    <p className="text-zinc-400">
                      {formatCurrency(p.revenueCents)} facturado
                    </p>
                    <p
                      className="mt-1 font-semibold"
                      style={{ color: QUADRANT_META[p.quadrant].color }}
                    >
                      {QUADRANT_META[p.quadrant].label}
                    </p>
                  </div>
                );
              }}
            />
            <Scatter data={points} isAnimationActive={false}>
              {points.map((p, i) => (
                <Cell key={i} fill={QUADRANT_META[p.quadrant].color} fillOpacity={0.75} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {QUADRANT_ORDER.map((q) => (
          <div key={q} className="rounded-xl bg-zinc-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: QUADRANT_META[q].color }}
              />
              {QUADRANT_META[q].label}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">{QUADRANT_META[q].tag}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
