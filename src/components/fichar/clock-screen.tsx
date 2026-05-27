"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock } from "lucide-react";

import {
  clockPunch,
  type ClockResult,
  type PresentEmployee,
} from "@/lib/rrhh/clock-actions";
import { formatTime, formatDuration } from "@/lib/rrhh/format-utils";
import { cn } from "@/lib/utils";

import { Numpad } from "./numpad";
import { PresentList } from "./present-list";

type FeedbackState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: ClockResult }
  | { status: "error"; message: string };

function useLiveClock() {
  const [time, setTime] = useState(() =>
    new Date().toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  useEffect(() => {
    const id = setInterval(
      () =>
        setTime(
          new Date().toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        ),
      1000,
    );
    return () => clearInterval(id);
  }, []);
  return time;
}

export function ClockScreen({
  slug,
  initialPresent,
}: {
  slug: string;
  initialPresent: PresentEmployee[];
}) {
  const [pin, setPin] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>({ status: "idle" });
  const [present, setPresent] = useState(initialPresent);
  const liveClock = useLiveClock();

  const handleDigit = useCallback(
    (d: string) => {
      if (feedback.status === "loading") return;
      if (feedback.status !== "idle") {
        setFeedback({ status: "idle" });
      }
      setPin((prev) => (prev.length < 4 ? prev + d : prev));
    },
    [feedback.status],
  );

  const handleDelete = useCallback(() => {
    if (feedback.status === "loading") return;
    if (feedback.status !== "idle") {
      setFeedback({ status: "idle" });
    }
    setPin((prev) => prev.slice(0, -1));
  }, [feedback.status]);

  useEffect(() => {
    if (pin.length < 4) return;

    setFeedback({ status: "loading" });

    clockPunch(slug, pin).then((r) => {
      if (!r.ok) {
        setFeedback({ status: "error", message: r.error });
      } else {
        setFeedback({ status: "success", result: r.data });
        if (r.data.type === "in") {
          setPresent((prev) => [
            ...prev,
            {
              userId: "",
              name: r.data.employeeName,
              role: "",
              clockIn: r.data.time,
            },
          ]);
        } else {
          setPresent((prev) =>
            prev.filter(
              (p) =>
                p.name.toLowerCase() !== r.data.employeeName.toLowerCase(),
            ),
          );
        }
      }
      setPin("");
      setTimeout(() => setFeedback({ status: "idle" }), 3000);
    });
  }, [pin, slug]);

  const isIn = feedback.status === "success" && feedback.result.type === "in";
  const isOut = feedback.status === "success" && feedback.result.type === "out";

  const pinSection = (
    <div className="flex flex-col items-center gap-6">
      {/* Live clock */}
      <p className="text-5xl font-bold tabular-nums text-white/90">
        {liveClock}
      </p>

      {/* Header */}
      <div className="flex items-center gap-2 text-zinc-400">
        <Clock className="size-5" />
        <span className="text-sm font-semibold uppercase tracking-wider">
          Fichada
        </span>
      </div>

      {/* PIN display */}
      <div className="flex gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex size-14 items-center justify-center rounded-xl border-2 text-2xl font-bold transition-all",
              i < pin.length
                ? "border-white bg-white/10 text-white"
                : "border-zinc-700 text-zinc-700",
            )}
          >
            {i < pin.length ? "•" : ""}
          </div>
        ))}
      </div>

      {/* Feedback */}
      <div className="h-24 w-full">
        {feedback.status === "loading" && (
          <div className="flex items-center justify-center gap-2 text-zinc-400">
            <div className="size-4 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
            <span className="text-sm">Procesando…</span>
          </div>
        )}

        {feedback.status === "error" && (
          <div className="rounded-2xl bg-red-500/10 px-6 py-4 text-center ring-1 ring-red-500/30">
            <p className="text-lg font-semibold text-red-400">
              {feedback.message}
            </p>
          </div>
        )}

        {isIn && (
          <div className="rounded-2xl bg-emerald-500/10 px-6 py-4 text-center ring-1 ring-emerald-500/30">
            <p className="text-3xl font-bold text-emerald-400">
              {feedback.result.employeeName[0]?.toUpperCase()}
            </p>
            <p className="mt-1 text-sm font-semibold text-emerald-400">
              ¡Bienvenido/a, {feedback.result.employeeName}!
            </p>
            <p className="text-xs text-emerald-400/70">
              Entrada: {formatTime(feedback.result.time)}
            </p>
          </div>
        )}

        {isOut && (
          <div className="rounded-2xl bg-blue-500/10 px-6 py-4 text-center ring-1 ring-blue-500/30">
            <p className="text-3xl font-bold text-blue-400">
              {feedback.result.employeeName[0]?.toUpperCase()}
            </p>
            <p className="mt-1 text-sm font-semibold text-blue-400">
              Hasta mañana, {feedback.result.employeeName}!
            </p>
            <p className="text-xs text-blue-400/70">
              Turno: {formatDuration(feedback.result.durationMinutes ?? 0)}
            </p>
          </div>
        )}
      </div>

      {/* Numpad */}
      <Numpad
        onDigit={handleDigit}
        onDelete={handleDelete}
        disabled={feedback.status === "loading"}
      />
    </div>
  );

  return (
    <div className="flex min-h-screen bg-zinc-950 text-white">
      {/* Portrait: single column. Landscape: two columns */}
      <div className="flex w-full flex-col items-center justify-center p-6 landscape:w-1/2 landscape:sm:w-1/2">
        <div className="w-full max-w-md">{pinSection}</div>
      </div>

      {/* Present list — below in portrait, right side in landscape */}
      <div className="w-full border-t border-zinc-800 p-6 landscape:w-1/2 landscape:overflow-y-auto landscape:border-l landscape:border-t-0 landscape:sm:w-1/2">
        <div className="mx-auto max-w-md landscape:max-w-none">
          <PresentList present={present} />
        </div>
      </div>
    </div>
  );
}
