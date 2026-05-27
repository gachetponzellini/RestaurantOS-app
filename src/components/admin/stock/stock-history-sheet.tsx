"use client";

import { useEffect, useState, useTransition } from "react";

import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import type { StockMovimiento } from "@/lib/stock/queries";

const KIND_LABELS: Record<string, { label: string; cls: string }> = {
  ingreso: { label: "Ingreso", cls: "bg-emerald-50 text-emerald-700" },
  venta: { label: "Venta", cls: "bg-sky-50 text-sky-700" },
  ajuste: { label: "Ajuste", cls: "bg-amber-50 text-amber-700" },
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function StockHistorySheet({
  open,
  onOpenChange,
  stockItemId,
  productName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockItemId: string;
  productName: string;
}) {
  const [items, setItems] = useState<StockMovimiento[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !stockItemId) return;
    setLoading(true);
    fetch(`/api/stock/history?stockItemId=${stockItemId}`)
      .then((r) => r.json())
      .then((data) => setItems(data.items ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open, stockItemId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Historial de movimientos</SheetTitle>
          <SheetDescription>{productName}</SheetDescription>
        </SheetHeader>

        <div className="overflow-y-auto p-4">
          {loading ? (
            <p className="py-8 text-center text-sm text-zinc-400">Cargando…</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-zinc-400">
              Sin movimientos
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <th className="pb-2 pr-3">Fecha</th>
                  <th className="pb-2 pr-3">Tipo</th>
                  <th className="pb-2 pr-3 text-right">Cant.</th>
                  <th className="pb-2 pr-3">Motivo</th>
                  <th className="pb-2">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {items.map((m) => {
                  const kind = KIND_LABELS[m.kind] ?? {
                    label: m.kind,
                    cls: "bg-zinc-50 text-zinc-600",
                  };
                  return (
                    <tr key={m.id}>
                      <td className="py-2 pr-3 text-zinc-500 whitespace-nowrap">
                        {formatDate(m.createdAt)}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={cn(
                            "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                            kind.cls,
                          )}
                        >
                          {kind.label}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "py-2 pr-3 text-right font-mono text-xs font-semibold",
                          m.qty > 0 ? "text-emerald-600" : "text-red-600",
                        )}
                      >
                        {m.qty > 0 ? `+${m.qty}` : m.qty}
                      </td>
                      <td className="py-2 pr-3 text-zinc-500">
                        {m.reason ?? "—"}
                      </td>
                      <td className="py-2 text-zinc-500">
                        {m.createdByName ?? "sistema"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
