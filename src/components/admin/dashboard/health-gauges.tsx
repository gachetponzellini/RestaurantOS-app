import { TriangleAlert } from "lucide-react";

import { formatCurrency } from "@/lib/currency";

type Status = "good" | "warn" | "bad";

const STATUS_COLOR: Record<Status, string> = {
  good: "#10b981",
  warn: "#f59e0b",
  bad: "#f43f5e",
};

const STATUS_LABEL: Record<Status, string> = {
  good: "Saludable",
  warn: "Atención",
  bad: "Crítico",
};

// Food cost: menor es mejor. Estándar gastronómico.
function foodCostStatus(pct: number): Status {
  if (pct < 32) return "good";
  if (pct <= 40) return "warn";
  return "bad";
}

// Margen bruto: mayor es mejor.
function marginStatus(pct: number): Status {
  if (pct >= 65) return "good";
  if (pct >= 55) return "warn";
  return "bad";
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

// Semicírculo de 180° (izquierda → derecha), arco superior.
function arcPath(cx: number, cy: number, r: number, fraction: number) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const startAngle = 180;
  const endAngle = 180 - clamped * 180;
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, endAngle);
  const largeArc = clamped > 0.5 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function Gauge({
  label,
  value,
  display,
  status,
  rangeHint,
}: {
  label: string;
  value: number; // 0..100 para el arco
  display: string;
  status: Status;
  rangeHint: string;
}) {
  const color = STATUS_COLOR[status];
  const fraction = Math.max(0, Math.min(1, value / 100));

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-[180px]">
        <svg viewBox="0 0 200 116" className="w-full">
          <path
            d={arcPath(100, 100, 84, 1)}
            fill="none"
            stroke="#f4f4f5"
            strokeWidth={16}
            strokeLinecap="round"
          />
          <path
            d={arcPath(100, 100, 84, fraction)}
            fill="none"
            stroke={color}
            strokeWidth={16}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-x-0 bottom-1 flex flex-col items-center">
          <span className="text-3xl font-semibold tracking-tight tabular-nums text-zinc-900">
            {display}
          </span>
        </div>
      </div>
      <div className="mt-1 flex flex-col items-center gap-1">
        <span className="text-sm font-semibold text-zinc-900">{label}</span>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold"
          style={{ backgroundColor: `${color}1a`, color }}
        >
          {STATUS_LABEL[status]}
        </span>
        <span className="text-[0.7rem] text-zinc-400">{rangeHint}</span>
      </div>
    </div>
  );
}

export function HealthGauges({
  foodCostPct,
  grossMarginPct,
  grossMarginCents,
  hasCostData,
}: {
  foodCostPct: number | null;
  grossMarginPct: number | null;
  grossMarginCents: number;
  hasCostData: boolean;
}) {
  return (
    <section className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200/70">
      <header className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Salud del negocio · últimos 30 días
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Rentabilidad
          </h2>
        </div>
      </header>

      {!hasCostData ? (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-dashed border-amber-200 bg-amber-50/60 p-4 text-sm text-amber-800">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          <p>
            Cargá <span className="font-semibold">recetas</span> en tus productos
            para ver food cost y margen reales. Sin recetas no hay costo de
            mercadería.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 items-end gap-8 sm:grid-cols-3">
          <Gauge
            label="Food cost"
            value={foodCostPct ?? 0}
            display={`${(foodCostPct ?? 0).toFixed(1)}%`}
            status={foodCostStatus(foodCostPct ?? 0)}
            rangeHint="sano < 32%"
          />
          <Gauge
            label="Margen bruto"
            value={grossMarginPct ?? 0}
            display={`${(grossMarginPct ?? 0).toFixed(1)}%`}
            status={marginStatus(grossMarginPct ?? 0)}
            rangeHint="sano > 65%"
          />
          <div className="flex flex-col items-center">
            <div className="flex h-[116px] w-full max-w-[180px] flex-col items-center justify-center rounded-2xl bg-zinc-50 ring-1 ring-zinc-200/70">
              <span className="text-2xl font-semibold tracking-tight tabular-nums text-zinc-900">
                {formatCurrency(grossMarginCents)}
              </span>
              <span className="mt-1 text-[0.7rem] font-medium text-zinc-500">
                ganancia bruta
              </span>
            </div>
            <div className="mt-1 flex flex-col items-center gap-1">
              <span className="text-sm font-semibold text-zinc-900">
                Margen $
              </span>
              <span className="text-[0.7rem] text-zinc-400">ventas − CMV</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
