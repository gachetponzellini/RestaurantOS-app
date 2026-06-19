"use client";

import { cn } from "@/lib/utils";

export function PinDisplay({
  length,
  size = "lg",
}: {
  /** Cantidad de dígitos ya ingresados (0-4). */
  length: number;
  size?: "md" | "lg";
}) {
  return (
    <div className="flex gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center justify-center rounded-xl border-2 font-bold transition-all",
            size === "lg" ? "size-14 text-2xl" : "size-12 text-xl",
            i < length
              ? "border-white bg-white/10 text-white"
              : "border-zinc-700 text-zinc-700",
          )}
        >
          {i < length ? "•" : ""}
        </div>
      ))}
    </div>
  );
}
