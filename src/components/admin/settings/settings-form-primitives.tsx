"use client";

import type React from "react";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Primitivos compartidos por los forms de Ajustes (Negocio / Apariencia /
// Cobros). Antes vivían dentro del monolito `business-settings-form.tsx`.

export type InputProps = React.ComponentProps<typeof Input>;

// ——— Input with leading icon ———
export function InputWithIcon({
  icon,
  className,
  ...rest
}: InputProps & { icon: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
        {icon}
      </span>
      <Input className={cn("pl-9", className)} {...rest} />
    </div>
  );
}

export function CurrencyInput(props: InputProps) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400">
        $
      </span>
      <Input type="number" min={0} step={1} className="pl-7" {...props} />
    </div>
  );
}

export function MinutesInput(props: InputProps) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
        <Clock className="size-3.5" />
      </span>
      <Input type="number" min={0} className="pr-14 pl-9" {...props} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[0.65rem] font-medium uppercase tracking-wider text-zinc-400">
        min
      </span>
    </div>
  );
}

// ——— Save bar (sticky, per form) ———
export function SaveBar({
  dirty,
  submitting,
  onDiscard,
}: {
  dirty: boolean;
  submitting: boolean;
  onDiscard: () => void;
}) {
  return (
    <div className="sticky bottom-6 z-10 flex items-center justify-end gap-2 rounded-full bg-white/80 p-2 pl-6 shadow-lg shadow-zinc-900/5 ring-1 ring-zinc-200/70 backdrop-blur">
      <p
        className={cn(
          "mr-auto inline-flex items-center gap-2 text-xs font-medium",
          dirty ? "text-amber-700" : "text-zinc-500",
        )}
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            dirty ? "bg-amber-500" : "bg-emerald-500",
          )}
        />
        {dirty ? "Cambios sin guardar" : "Todo guardado"}
      </p>
      <Button
        type="button"
        variant="ghost"
        onClick={onDiscard}
        disabled={submitting || !dirty}
        className="rounded-full"
      >
        Descartar
      </Button>
      <button
        type="submit"
        disabled={submitting || !dirty}
        className="inline-flex h-10 items-center rounded-full px-5 text-sm font-semibold transition-all hover:brightness-95 active:translate-y-px disabled:pointer-events-none disabled:opacity-50"
        style={{
          background: "var(--brand)",
          color: "var(--brand-foreground)",
          boxShadow: "0 10px 24px -14px var(--brand)",
        }}
      >
        {submitting ? "Guardando…" : "Guardar cambios"}
      </button>
    </div>
  );
}
