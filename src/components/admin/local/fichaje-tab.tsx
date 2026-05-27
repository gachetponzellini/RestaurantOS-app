"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Fingerprint, LogOut, UserX, X } from "lucide-react";

import {
  clockPunch,
  getCurrentPresent,
  type ClockResult,
  type PresentEmployee,
} from "@/lib/rrhh/clock-actions";
import type { TodaySummary } from "@/lib/rrhh/clock-queries";
import { formatTime, formatDuration } from "@/lib/rrhh/format-utils";
import { PresentEmployeeCard } from "@/components/shared/present-employee-card";
import { RoleBadge } from "@/components/shared/role-badge";
import { Numpad } from "@/components/fichar/numpad";
import { cn } from "@/lib/utils";

type FeedbackState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: ClockResult }
  | { status: "error"; message: string };

export function FichajeTab({
  slug,
  initialPresent,
  todaySummary,
}: {
  slug: string;
  initialPresent: PresentEmployee[];
  todaySummary?: TodaySummary;
}) {
  const [present, setPresent] = useState(initialPresent);
  const [finished] = useState(todaySummary?.finished ?? []);
  const [absent] = useState(todaySummary?.absent ?? []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>({ status: "idle" });

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
    <div className="flex h-full gap-6">
      {/* Left: Presentes + action */}
      <div className="flex flex-1 flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Asistencia del día
            </h2>
            <p className="text-sm text-zinc-500">
              {present.length}{" "}
              {present.length === 1 ? "persona" : "personas"} trabajando
              ahora
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

        {present.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-400">
            <Clock className="size-10 opacity-40" />
            <p className="text-sm">No hay nadie fichado todavía.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {present.map((e) => (
              <PresentEmployeeCard
                key={e.userId + e.clockIn}
                name={e.name}
                role={e.role}
                clockIn={e.clockIn}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right sidebar: finished + absent */}
      {(finished.length > 0 || absent.length > 0) && (
        <aside className="hidden w-72 shrink-0 space-y-5 overflow-y-auto rounded-2xl bg-white p-5 ring-1 ring-zinc-200/60 lg:block">
          {finished.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                <LogOut className="size-3.5" />
                Ya salieron ({finished.length})
              </div>
              <ul className="space-y-1.5">
                {finished.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50"
                  >
                    <span className="truncate font-medium text-zinc-700">
                      {e.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                      {formatDuration(e.durationMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {absent.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                <UserX className="size-3.5" />
                Sin fichar ({absent.length})
              </div>
              <ul className="space-y-1.5">
                {absent.map((a) => (
                  <li
                    key={a.userId}
                    className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm"
                  >
                    <span className="truncate text-zinc-500">{a.name}</span>
                    <RoleBadge role={a.role} size="xs" />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
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
                      Turno:{" "}
                      {formatDuration(feedback.result.durationMinutes ?? 0)}
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
