"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SearchInput({
  value,
  onChange,
  placeholder = "Buscar...",
  "aria-label": ariaLabel = "Buscar",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-zinc-400" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-8 pl-8 text-xs"
      />
    </div>
  );
}
