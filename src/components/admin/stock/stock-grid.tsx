"use client";

import { useState } from "react";
import { History, PackagePlus, PackageMinus, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { StockOverviewItem } from "@/lib/stock/queries";
import { StockMovementSheet } from "@/components/admin/stock/stock-movement-sheet";
import { StockHistorySheet } from "@/components/admin/stock/stock-history-sheet";

function qtyColor(current: number, min: number): string {
  if (current <= 0) return "text-red-600 bg-red-50";
  if (current <= min) return "text-amber-700 bg-amber-50";
  return "text-emerald-700 bg-emerald-50";
}

export function StockGrid({
  items,
  slug,
}: {
  items: StockOverviewItem[];
  slug: string;
}) {
  const [search, setSearch] = useState("");
  const [movementSheet, setMovementSheet] = useState<{
    open: boolean;
    productId: string;
    productName: string;
    mode: "ingreso" | "ajuste";
  }>({ open: false, productId: "", productName: "", mode: "ingreso" });
  const [historySheet, setHistorySheet] = useState<{
    open: boolean;
    stockItemId: string;
    productName: string;
  }>({ open: false, stockItemId: "", productName: "" });

  const filtered = items.filter(
    (i) =>
      i.productName.toLowerCase().includes(search.toLowerCase()) ||
      (i.categoryName?.toLowerCase().includes(search.toLowerCase()) ?? false),
  );

  return (
    <>
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Buscar producto o categoría…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <span className="text-sm text-zinc-500">
          {filtered.length} producto{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/70 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Mínimo</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtered.map((item) => (
              <tr key={item.stockItemId} className="transition hover:bg-zinc-50/50">
                <td className="px-4 py-3 font-medium text-zinc-900">
                  {item.productName}
                </td>
                <td className="px-4 py-3 text-zinc-500">
                  {item.categoryName ?? "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={cn(
                      "inline-flex min-w-[2.5rem] items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      qtyColor(item.currentQty, item.minQty),
                    )}
                  >
                    {item.currentQty}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-zinc-500">
                  {item.minQty}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() =>
                        setMovementSheet({
                          open: true,
                          productId: item.productId,
                          productName: item.productName,
                          mode: "ingreso",
                        })
                      }
                      className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-emerald-50 hover:text-emerald-700"
                      title="Ingresar stock"
                    >
                      <PackagePlus className="size-4" />
                    </button>
                    <button
                      onClick={() =>
                        setMovementSheet({
                          open: true,
                          productId: item.productId,
                          productName: item.productName,
                          mode: "ajuste",
                        })
                      }
                      className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-amber-50 hover:text-amber-700"
                      title="Ajustar stock"
                    >
                      <PackageMinus className="size-4" />
                    </button>
                    <button
                      onClick={() =>
                        setHistorySheet({
                          open: true,
                          stockItemId: item.stockItemId,
                          productName: item.productName,
                        })
                      }
                      className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                      title="Ver historial"
                    >
                      <History className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <StockMovementSheet
        open={movementSheet.open}
        onOpenChange={(open) => setMovementSheet((s) => ({ ...s, open }))}
        productId={movementSheet.productId}
        productName={movementSheet.productName}
        mode={movementSheet.mode}
        slug={slug}
      />

      <StockHistorySheet
        open={historySheet.open}
        onOpenChange={(open) => setHistorySheet((s) => ({ ...s, open }))}
        stockItemId={historySheet.stockItemId}
        productName={historySheet.productName}
      />
    </>
  );
}
