"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  History,
  PackageMinus,
  PackagePlus,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { StockHistorySheet } from "@/components/admin/stock/stock-history-sheet";
import { StockMovementSheet } from "@/components/admin/stock/stock-movement-sheet";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/currency";
import { setBarStock, setStockLevels } from "@/lib/stock/actions";
import type { StockOverviewItem } from "@/lib/stock/queries";
import { cn } from "@/lib/utils";

export type BarStockCandidate = {
  id: string;
  name: string;
  categoryName: string | null;
};

function qtyColor(current: number, min: number): string {
  if (current <= 0) return "text-red-600 bg-red-50";
  if (current <= min) return "text-amber-700 bg-amber-50";
  return "text-emerald-700 bg-emerald-50";
}

export function StockBarTab({
  slug,
  items,
  candidates,
  costByProduct,
}: {
  slug: string;
  items: StockOverviewItem[];
  candidates: BarStockCandidate[];
  /** productId → food cost en centavos (solo productos con receta). */
  costByProduct: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

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

  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          i.productName.toLowerCase().includes(search.toLowerCase()) ||
          (i.categoryName?.toLowerCase().includes(search.toLowerCase()) ?? false),
      ),
    [items, search],
  );

  function handleRemove(productId: string, name: string) {
    startTransition(async () => {
      const r = await setBarStock(productId, false, slug);
      if (r.ok) {
        toast.success(`Quitado del stock de bar: ${name}`);
        router.refresh();
      } else {
        toast.error(r.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Buscar producto o categoría…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => setAdding(true)} className="gap-2">
          <Plus className="size-4" />
          Agregar producto
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 py-16 text-center">
          <PackagePlus className="size-10 text-zinc-400" strokeWidth={1.5} />
          <div>
            <p className="text-sm font-medium text-zinc-700">
              No hay productos en el stock de bar
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Agregá productos puntuales (alfajores, turrón…) sin tocar listas
              globales.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/70 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3 text-right">Costo</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3 text-right">Mínimo</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((item) => {
                const cost = costByProduct[item.productId];
                return (
                  <tr key={item.stockItemId} className="transition hover:bg-zinc-50/50">
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {item.productName}
                    </td>
                    <td className="px-4 py-3 text-zinc-500">
                      {item.categoryName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
                      {cost != null ? (
                        formatCurrency(cost)
                      ) : (
                        <span className="italic text-zinc-400">—</span>
                      )}
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
                        <button
                          onClick={() => handleRemove(item.productId, item.productName)}
                          disabled={pending}
                          className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                          title="Quitar del stock de bar"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

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

      {adding && (
        <AddBarProduct
          slug={slug}
          candidates={candidates}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}

// ── AddBarProduct: alta puntual de un producto al stock de bar ───

function AddBarProduct({
  slug,
  candidates,
  onClose,
}: {
  slug: string;
  candidates: BarStockCandidate[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<BarStockCandidate | null>(null);
  const [qty, setQty] = useState("0");

  const filtered = useMemo(
    () =>
      candidates.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [candidates, search],
  );

  function handleAdd() {
    if (!selected) return;
    const initial = parseInt(qty, 10);
    if (isNaN(initial) || initial < 0) {
      toast.error("Ingresá una cantidad válida.");
      return;
    }
    startTransition(async () => {
      const r1 = await setBarStock(selected.id, true, slug);
      if (!r1.ok) {
        toast.error(r1.error);
        return;
      }
      if (initial > 0) {
        const r2 = await setStockLevels(selected.id, initial, 0, slug);
        if (!r2.ok) {
          toast.error(r2.error);
          return;
        }
      }
      toast.success(`Agregado al stock de bar: ${selected.name}`);
      router.refresh();
      onClose();
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agregar producto al stock de bar</DialogTitle>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <Input
                autoFocus
                placeholder="Buscar producto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-72 overflow-auto rounded-xl border border-zinc-200">
              {filtered.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-zinc-400">
                  No hay productos disponibles para agregar.
                </p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {filtered.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(c)}
                        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition hover:bg-zinc-50"
                      >
                        <span className="font-medium text-zinc-900">{c.name}</span>
                        <span className="text-xs text-zinc-400">
                          {c.categoryName ?? "—"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAdd();
            }}
            className="space-y-4"
          >
            <div className="rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200/60">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Producto
              </p>
              <p className="text-base font-bold text-zinc-900">{selected.name}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">
                Stock inicial (unidades)
              </label>
              <Input
                type="number"
                min={0}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelected(null)}
                disabled={pending}
              >
                Volver
              </Button>
              <Button type="submit" disabled={pending} className="gap-2">
                <Plus className="size-4" />
                Agregar
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
