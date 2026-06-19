"use client";

import { cn } from "@/lib/utils";
import { type ClockResult } from "@/lib/rrhh/clock-actions";
import { formatDuration, formatTime } from "@/lib/rrhh/format-utils";

export type FeedbackState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: ClockResult }
  | { status: "error"; message: string };

/**
 * Panel de feedback de fichada (pantalla oscura). Define los colores semánticos
 * —error=red, entrada=emerald, salida=blue— una sola vez para kiosco y modal.
 *
 * - `size="lg"`: pantalla kiosco completa (inicial grande + saludo).
 * - `size="md"`: modal compacto del panel local.
 */
export function ClockFeedback({
  feedback,
  size = "lg",
}: {
  feedback: FeedbackState;
  size?: "md" | "lg";
}) {
  if (feedback.status === "idle") return null;

  if (feedback.status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-zinc-400">
        <div className="size-4 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
        <span className="text-sm">Procesando…</span>
      </div>
    );
  }

  const lg = size === "lg";
  const panel = cn(
    "text-center",
    lg ? "rounded-2xl px-6 py-4" : "rounded-xl px-4 py-3",
  );

  if (feedback.status === "error") {
    return (
      <div className={cn(panel, "bg-red-500/10 ring-1 ring-red-500/30")}>
        <p
          className={cn(
            "font-semibold text-red-400",
            lg ? "text-lg" : "text-sm",
          )}
        >
          {feedback.message}
        </p>
      </div>
    );
  }

  const { result } = feedback;
  const isIn = result.type === "in";
  const initial = result.employeeName[0]?.toUpperCase();
  const textColor = isIn ? "text-emerald-400" : "text-blue-400";
  const subColor = isIn ? "text-emerald-400/70" : "text-blue-400/70";

  return (
    <div
      className={cn(
        panel,
        isIn
          ? "bg-emerald-500/10 ring-1 ring-emerald-500/30"
          : "bg-blue-500/10 ring-1 ring-blue-500/30",
      )}
    >
      {lg && <p className={cn("text-3xl font-bold", textColor)}>{initial}</p>}
      <p className={cn("text-sm font-semibold", lg && "mt-1", textColor)}>
        {lg
          ? isIn
            ? `¡Bienvenido/a, ${result.employeeName}!`
            : `Hasta mañana, ${result.employeeName}!`
          : isIn
            ? `¡Entrada registrada, ${result.employeeName}!`
            : `Salida registrada, ${result.employeeName}`}
      </p>
      <p className={cn("text-xs", subColor)}>
        {isIn
          ? `${lg ? "Entrada: " : ""}${formatTime(result.time)}`
          : `Turno: ${formatDuration(result.durationMinutes ?? 0)}`}
      </p>
    </div>
  );
}
