"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";

import { toggleBusinessOpen } from "@/lib/admin/business-actions";
import { cn } from "@/lib/utils";

function greetingFor(hour: number): string {
  if (hour < 6) return "Buenas noches";
  if (hour < 13) return "Buen día";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

export function DashboardHeader({
  businessName,
  userName,
  timezone,
  slug,
  isActive = true,
}: {
  businessName: string;
  userName?: string | null;
  timezone: string;
  slug: string;
  isActive?: boolean;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const clockFmt = new Intl.DateTimeFormat("es-AR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateFmt = new Intl.DateTimeFormat("es-AR", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const hour = now
    ? Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: timezone,
          hour: "2-digit",
          hour12: false,
        }).format(now),
      )
    : 12;

  const greeting = greetingFor(hour);
  const firstName =
    userName?.split(/\s+/)[0] ??
    businessName.split(/\s+/)[0] ??
    businessName;

  // ── Open/closed toggle ───────────────────────────────────────────────────
  const [isPending, startTransition] = useTransition();
  const [optimisticOpen, setOptimisticOpen] = useOptimistic(isActive);

  const handleToggle = () => {
    const next = !optimisticOpen;
    startTransition(async () => {
      setOptimisticOpen(next);
      const result = await toggleBusinessOpen(slug, next);
      if (!result.ok) {
        toast.error(result.error);
      } else {
        toast.success(
          next ? "Negocio abierto — ya recibe pedidos." : "Negocio cerrado temporalmente.",
        );
      }
    });
  };

  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
          Panel · {businessName}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
          {greeting},{" "}
          <span className="text-zinc-500">{firstName}</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Resumen del día y lo que tus clientes están viendo ahora mismo.
        </p>
      </div>

      {/* ── Clock card ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white px-5 py-4 text-right ring-1 ring-zinc-200/70">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Hora del local
        </p>
        <p className="mt-1 text-3xl font-semibold tabular-nums text-zinc-900">
          {now ? clockFmt.format(now) : "--:--"}
        </p>
        {/* Date + open/closed toggle on the same line */}
        <div className="mt-0.5 flex items-center justify-end gap-2">
          <p className="text-xs capitalize text-zinc-500">
            {now ? dateFmt.format(now) : ""}
          </p>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "text-xs font-semibold transition-colors",
                optimisticOpen ? "text-emerald-600" : "text-zinc-400",
              )}
            >
              {optimisticOpen ? "Abierto" : "Cerrado"}
            </span>
            <OpenSwitch
              isOpen={optimisticOpen}
              isPending={isPending}
              onToggle={handleToggle}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── Toggle switch (iOS-style) ────────────────────────────────────────────────

function OpenSwitch({
  isOpen,
  isPending,
  onToggle,
}: {
  isOpen: boolean;
  isPending: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isOpen}
      aria-label={isOpen ? "Cerrar negocio temporalmente" : "Abrir negocio para pedidos"}
      title={isOpen ? "Cerrar temporalmente" : "Abrir para pedidos"}
      onClick={onToggle}
      disabled={isPending}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full",
        "transition-colors duration-200 focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-zinc-900/20 focus-visible:ring-offset-1",
        "disabled:cursor-wait disabled:opacity-70",
        isOpen ? "bg-emerald-500" : "bg-zinc-300",
      )}
    >
      <span
        className={cn(
          "inline-block size-3.5 rounded-full bg-white shadow-sm",
          "transition-transform duration-200",
          isOpen ? "translate-x-[18px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}
