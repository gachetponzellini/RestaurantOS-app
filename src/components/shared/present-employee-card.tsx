"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { elapsedSince, formatTime } from "@/lib/rrhh/format-utils";
import { RoleBadge } from "./role-badge";

export function PresentEmployeeCard({
  name,
  role,
  clockIn,
  variant = "light",
}: {
  name: string;
  role: string;
  clockIn: string;
  variant?: "light" | "dark";
}) {
  const [elapsed, setElapsed] = useState(() => elapsedSince(clockIn));

  useEffect(() => {
    const id = setInterval(() => setElapsed(elapsedSince(clockIn)), 30_000);
    return () => clearInterval(id);
  }, [clockIn]);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl p-4",
        variant === "light"
          ? "bg-white ring-1 ring-zinc-200/60"
          : "bg-zinc-800/50 ring-1 ring-zinc-700/40",
      )}
    >
      <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p
            className={cn(
              "truncate text-sm font-semibold",
              variant === "light" ? "text-zinc-900" : "text-zinc-100",
            )}
          >
            {name}
          </p>
          <RoleBadge role={role} size="xs" />
        </div>
        <p
          className={cn(
            "text-xs",
            variant === "light" ? "text-zinc-500" : "text-zinc-400",
          )}
        >
          {formatTime(clockIn)} · {elapsed}
        </p>
      </div>
    </div>
  );
}
