"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Fingerprint, LogOut, UserX, X } from "lucide-react";

import {
  clockPunch,
  getCurrentPresent,
  type PresentEmployee,
} from "@/lib/rrhh/clock-actions";
import type { TodaySummary } from "@/lib/rrhh/clock-queries";
import { formatDuration } from "@/lib/rrhh/format-utils";
import { PresentEmployeeCard } from "@/components/shared/present-employee-card";
import { RoleBadge } from "@/components/shared/role-badge";
import { Button } from "@/components/ui/button";
import {
  ClockFeedback,
  type FeedbackState,
} from "@/components/fichar/clock-feedback";
import { Numpad } from "@/components/fichar/numpad";
import { PinDisplay } from "@/components/fichar/pin-display";

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

  return (
    <div className="flex h-full flex-col gap-6 lg:flex-row">
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
          <Button size="lg" onClick={() => setDialogOpen(true)}>
            <Fingerprint className="size-4" />
            Marcar asistencia
          </Button>
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

      {/* Sidebar: finished + absent (apilado debajo en <lg) */}
      {(finished.length > 0 || absent.length > 0) && (
        <aside className="w-full shrink-0 space-y-5 overflow-y-auto rounded-2xl bg-white p-5 ring-1 ring-zinc-200/70 lg:w-72">
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
              aria-label="Cerrar"
              className="absolute right-4 top-4 rounded-lg p-1 text-zinc-400 transition hover:text-white"
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

              <PinDisplay length={pin.length} size="md" />

              <div className="h-16 w-full">
                <ClockFeedback feedback={feedback} size="md" />
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
