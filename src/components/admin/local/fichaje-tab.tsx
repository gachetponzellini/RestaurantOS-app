"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Fingerprint, LogOut, X } from "lucide-react";

import {
  clockPunch,
  getCurrentPresent,
  type ClockResult,
  type PresentEmployee,
} from "@/lib/rrhh/clock-actions";
import { ROLE_META } from "@/lib/admin/roles";
import type { BusinessRoleInput } from "@/lib/admin/roles";
import { cn } from "@/lib/utils";
import { Numpad } from "@/components/fichar/numpad";

type FeedbackState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: ClockResult }
  | { status: "error"; message: string };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function elapsedSince(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function FichajeTab({
  slug,
  initialPresent,
}: {
  slug: string;
  initialPresent: PresentEmployee[];
}) {
  const [present, setPresent] = useState(initialPresent);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>({ status: "idle" });

  // Refresh present list periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      const updated = await getCurrentPresent(slug);
      setPresent(updated);
    }, 60_000);
    return () => clearInterval(interval);
  }, [slug]);

  const handleDigit = useCallback(
    (d: string) => {
      if (feedback.status === "loading") return;
      if (feedback.status !== "idle") setFeedback({ status: "idle" });
      setPin((prev) => (prev.length < 4 ? prev + d : prev));
    },
    [feedback.status],
  );

  const handleDelete = useCallback(() => {
    if (feedback.status === "loading") return;
    if (feedback.status !== "idle") setFeedback({ status: "idle" });
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
      setTimeout(() => {
        setFeedback({ status: "idle" });
        if (r.ok) setDialogOpen(false);
      }, 2000);
    });
  }, [pin, slug]);

  const isIn = feedback.status === "success" && feedback.result.type === "in";
  const isOut = feedback.status === "success" && feedback.result.type === "out";

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Header with action button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            Asistencia del día
          </h2>
          <p className="text-sm text-zinc-500">
            {present.length} {present.length === 1 ? "persona" : "personas"} trabajando ahora
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
        >
          <Fingerprint className="size-4" />
          Marcar asistencia
        </button>
      </div>

      {/* Present employees grid */}
      {present.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-400">
          <Clock className="size-10 opacity-40" />
          <p className="text-sm">No hay nadie fichado todavía.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {present.map((e) => (
            <div
              key={e.userId + e.clockIn}
              className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200/60"
            >
              <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-900">
                  {e.name}
                </p>
                <p className="text-xs text-zinc-500">
                  {ROLE_META[e.role as BusinessRoleInput]?.label ?? e.role}
                  {" · "}
                  {formatTime(e.clockIn)} · {elapsedSince(e.clockIn)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Numpad dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="relative w-full max-w-sm rounded-3xl bg-zinc-950 p-8 text-white shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setDialogOpen(false);
                setPin("");
                setFeedback({ status: "idle" });
              }}
              className="absolute right-4 top-4 rounded-lg p-1 text-zinc-400 hover:text-white"
            >
              <X className="size-5" />
            </button>

            <div className="flex flex-col items-center gap-6">
              <div className="flex items-center gap-2 text-zinc-400">
                <Fingerprint className="size-5" />
                <span className="text-sm font-semibold uppercase tracking-wider">
                  Ingresá tu PIN
                </span>
              </div>

              {/* PIN dots */}
              <div className="flex gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex size-12 items-center justify-center rounded-xl border-2 text-xl font-bold transition-all",
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
              <div className="h-16 w-full">
                {feedback.status === "loading" && (
                  <div className="flex items-center justify-center gap-2 text-zinc-400">
                    <div className="size-4 animate-spin rounded-full border-2 border-zinc-600 border-t-white" />
                    <span className="text-sm">Procesando…</span>
                  </div>
                )}
                {feedback.status === "error" && (
                  <div className="rounded-xl bg-red-500/10 px-4 py-3 text-center ring-1 ring-red-500/30">
                    <p className="text-sm font-semibold text-red-400">
                      {feedback.message}
                    </p>
                  </div>
                )}
                {isIn && (
                  <div className="rounded-xl bg-emerald-500/10 px-4 py-3 text-center ring-1 ring-emerald-500/30">
                    <p className="text-sm font-semibold text-emerald-400">
                      ¡Entrada registrada, {feedback.result.employeeName}!
                    </p>
                    <p className="text-xs text-emerald-400/70">
                      {formatTime(feedback.result.time)}
                    </p>
                  </div>
                )}
                {isOut && (
                  <div className="rounded-xl bg-blue-500/10 px-4 py-3 text-center ring-1 ring-blue-500/30">
                    <p className="text-sm font-semibold text-blue-400">
                      Salida registrada, {feedback.result.employeeName}
                    </p>
                    <p className="text-xs text-blue-400/70">
                      Turno: {formatDuration(feedback.result.durationMinutes ?? 0)}
                    </p>
                  </div>
                )}
              </div>

              <Numpad
                onDigit={handleDigit}
                onDelete={handleDelete}
                disabled={feedback.status === "loading"}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
