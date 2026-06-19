"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock } from "lucide-react";

import { clockPunch, type PresentEmployee } from "@/lib/rrhh/clock-actions";

import { ClockFeedback, type FeedbackState } from "./clock-feedback";
import { Numpad } from "./numpad";
import { PinDisplay } from "./pin-display";
import { PresentList } from "./present-list";

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
      <PinDisplay length={pin.length} size="lg" />

      {/* Feedback */}
      <div className="h-24 w-full">
        <ClockFeedback feedback={feedback} size="lg" />
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
