"use client";

import type { FloorPlan, FloorTable, OperationalStatus } from "@/lib/reservations/types";

const STATUS_COLORS: Record<OperationalStatus, { fill: string; stroke: string }> = {
  libre: { fill: "#f4f4f5", stroke: "#a1a1aa" },
  ocupada: { fill: "#d1fae5", stroke: "#059669" },
  pidio_cuenta: { fill: "#fef3c7", stroke: "#d97706" },
};

export type TableExtra = {
  reservation?: {
    customer_name: string;
    party_size: number;
    starts_at: string; // ISO
  };
  order?: {
    order_number: number;
    total_cents: number;
    delivery_type: string;
  };
  minutesOpen?: number;
  mozoInitial?: string;
  /** HSL determinístico por user_id — pinta el badge con el color del mozo. */
  mozoColor?: string;
};

type Props = {
  plan: Pick<FloorPlan, "width" | "height" | "background_image_url" | "background_opacity">;
  tables: FloorTable[];
  extras?: Record<string, TableExtra>; // keyed by table.id
  onTableClick?: (table: FloorTable) => void;
  /**
   * Modo "pintura" — cuando está activo, las mesas se tiñen por mozo
   * asignado (en vez de color de estado) y el click llama a `onTableClick`
   * con la intención de asignar (el padre decide qué hacer). Cada mesa
   * mira su `extras[id].mozoColor` para decidir el tinte; sin color =
   * sin asignar = gris.
   */
  paintMode?: boolean;
};

export function FloorPlanViewer({ plan, tables, extras = {}, onTableClick, paintMode = false }: Props) {
  const active = tables.filter((t) => t.status === "active");

  return (
    <div className="overflow-auto rounded-xl border bg-muted/30 shadow-inner">
      <svg
        viewBox={`0 0 ${plan.width} ${plan.height}`}
        className="block w-full rounded-lg bg-background"
        style={{ aspectRatio: `${plan.width}/${plan.height}`, maxHeight: "68vh" }}
      >
        {plan.background_image_url && (
          <image
            href={plan.background_image_url}
            x={0}
            y={0}
            width={plan.width}
            height={plan.height}
            preserveAspectRatio="xMidYMid slice"
            opacity={plan.background_opacity / 100}
          />
        )}

        {active.map((table) => (
          <ViewerTable
            key={table.id}
            table={table}
            extra={extras[table.id]}
            paintMode={paintMode}
            onClick={() => onTableClick?.(table)}
          />
        ))}
      </svg>
    </div>
  );
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Tiempo abierto, compacto para el label del plano: "45m", "1h30", "3h", "2d".
 * Antes mostrábamos siempre minutos ("95m"), poco legible pasada la hora.
 */
function formatOpenCompact(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  if (h < 24) {
    const m = minutes % 60;
    return m === 0 ? `${h}h` : `${h}h${m}`;
  }
  return `${Math.floor(h / 24)}d`;
}

function ViewerTable({
  table,
  extra,
  paintMode,
  onClick,
}: {
  table: FloorTable;
  extra?: TableExtra;
  paintMode: boolean;
  onClick: () => void;
}) {
  const cx = table.width / 2;
  const cy = table.height / 2;
  const transform = `translate(${table.x} ${table.y}) rotate(${table.rotation} ${cx} ${cy})`;
  const opStatus = table.operational_status ?? "libre";

  // En paint mode: ganan los colores del mozo asignado sobre el estado.
  // Sin mozo → gris zinc (señal de "sin asignar" en este modo).
  const statusColors = STATUS_COLORS[opStatus];
  const fill = paintMode
    ? extra?.mozoColor
      ? `${extra.mozoColor}40` // alpha ~25% para que el label se lea
      : "#f4f4f5"
    : statusColors.fill;
  const stroke = paintMode
    ? extra?.mozoColor ?? "#a1a1aa"
    : statusColors.stroke;
  const strokeWidth = paintMode ? 3 : 2.5;

  const labelSize = Math.min(table.width, table.height) * 0.22;
  const subSize = Math.max(9, labelSize * 0.62);
  const isLarge = Math.min(table.width, table.height) >= 90;

  // Qué mostrar debajo del label
  const hasReservation = !!extra?.reservation;
  const minutesOpen = extra?.minutesOpen;

  // Línea secundaria bajo el label (oculta en paint mode para no saturar).
  let subLine: string | null = null;
  if (!paintMode) {
    if (hasReservation && opStatus === "libre") {
      subLine = `${extra!.reservation!.starts_at ? formatTime(extra!.reservation!.starts_at) : ""} · ${extra!.reservation!.party_size}p`;
    } else if (minutesOpen != null && minutesOpen >= 0) {
      subLine = formatOpenCompact(minutesOpen);
    }
  }

  return (
    <g transform={transform} onClick={onClick} style={{ cursor: "pointer" }}>
      {/* Mesa */}
      {table.shape === "circle" ? (
        <ellipse
          cx={cx}
          cy={cy}
          rx={table.width / 2}
          ry={table.height / 2}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          style={{ filter: "drop-shadow(0 2px 4px rgb(0 0 0 / 0.1))" }}
        />
      ) : (
        <rect
          x={0}
          y={0}
          width={table.width}
          height={table.height}
          rx={table.shape === "rect" ? 10 : 6}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          style={{ filter: "drop-shadow(0 2px 4px rgb(0 0 0 / 0.1))" }}
        />
      )}

      {/* Label central */}
      <text
        x={cx}
        y={subLine ? cy - 2 : cy + labelSize * 0.35}
        textAnchor="middle"
        fontSize={labelSize}
        fontWeight="700"
        fill="#18181b"
        style={{ userSelect: "none", pointerEvents: "none", fontFamily: "inherit" }}
      >
        {table.label}
      </text>

      {/* Sub-línea: hora de reserva o tiempo abierta */}
      {subLine && (
        <text
          x={cx}
          y={cy + subSize + 2}
          textAnchor="middle"
          fontSize={subSize}
          fontWeight="500"
          fill="#52525b"
          style={{ userSelect: "none", pointerEvents: "none", fontFamily: "inherit" }}
        >
          {subLine}
        </text>
      )}

      {/* Badge reserva (esquina superior derecha) — solo mesas grandes */}
      {hasReservation && isLarge && (
        <>
          <circle
            cx={table.width - 10}
            cy={10}
            r={8}
            fill="#6366f1"
            stroke="white"
            strokeWidth={1.5}
          />
          <text
            x={table.width - 10}
            y={14}
            textAnchor="middle"
            fontSize="8"
            fontWeight="700"
            fill="white"
            style={{ userSelect: "none", pointerEvents: "none" }}
          >
            R
          </text>
        </>
      )}

      {/* Badge mozo asignado (esquina inferior derecha) — color del mozo */}
      {extra?.mozoInitial && (
        <>
          <circle
            cx={table.width - 11}
            cy={table.height - 11}
            r={11}
            fill={extra.mozoColor ?? "#0f172a"}
            stroke="white"
            strokeWidth={1.5}
          />
          <text
            x={table.width - 11}
            y={table.height - 7.5}
            textAnchor="middle"
            fontSize="9.5"
            fontWeight="700"
            fill="white"
            style={{ userSelect: "none", pointerEvents: "none" }}
          >
            {extra.mozoInitial}
          </text>
        </>
      )}

    </g>
  );
}
