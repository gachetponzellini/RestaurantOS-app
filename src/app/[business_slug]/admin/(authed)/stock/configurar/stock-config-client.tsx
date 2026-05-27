"use client";

import { useState, useTransition } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { ProductForStockConfig } from "@/lib/stock/queries";
import { toggleTrackStock, setStockLevels } from "@/lib/stock/actions";

export function StockConfigClient({
  products: initial,
  slug,
}: {
  products: ProductForStockConfig[];
  slug: string;
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [pending, startTransition] = useTransition();

  const [activating, setActivating] = useState<string | null>(null);
  const [initialQty, setInitialQty] = useState("0");
  const [initialMin, setInitialMin] = useState("3");

  const categories = Array.from(
    new Set(initial.map((p) => p.categoryName).filter(Boolean)),
  ).sort() as string[];

  const filtered = initial.filter((p) => {
    if (categoryFilter !== "all" && p.categoryName !== categoryFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  function handleToggle(productId: string, name: string, enabled: boolean) {
    if (enabled) {
      setActivating(productId);
      setInitialQty("0");
      setInitialMin("3");
      return;
    }
    startTransition(async () => {
      const result = await toggleTrackStock(productId, false, slug);
      if (result.ok) toast.success(`Stock desactivado: ${name}`);
      else toast.error(result.error);
    });
  }

  function handleSaveInitial(productId: string, name: string) {
    startTransition(async () => {
      const qty = parseInt(initialQty, 10);
      const min = parseInt(initialMin, 10);
      if (isNaN(qty) || isNaN(min)) {
        toast.error("Ingresá números válidos.");
        return;
      }
      const r1 = await toggleTrackStock(productId, true, slug);
      if (!r1.ok) { toast.error(r1.error); return; }
      const r2 = await setStockLevels(productId, qty, min, slug);
      if (r2.ok) toast.success(`Stock activado: ${name}`);
      else toast.error(r2.error);
      setActivating(null);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Buscar producto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
        >
          <option value="all">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/70 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">Producto</th>
              <th className="px-4 py-3">Categoría</th>
              <th className="px-4 py-3 text-center">Tracking</th>
              <th className="px-4 py-3 text-right">Stock</th>
              <th className="px-4 py-3 text-right">Mín</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filtered.map((p) => (
              <tr
                key={p.id}
                className={cn(
                  "transition",
                  activating === p.id ? "bg-emerald-50/50" : "hover:bg-zinc-50/50",
                )}
              >
                <td className="px-4 py-3 font-medium text-zinc-900">{p.name}</td>
                <td className="px-4 py-3 text-zinc-500">{p.categoryName ?? "—"}</td>
                <td className="px-4 py-3 text-center">
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input
                      type="checkbox"
                      checked={p.trackStock || activating === p.id}
                      onChange={(e) => handleToggle(p.id, p.name, e.target.checked)}
                      disabled={pending}
                      className="peer sr-only"
                    />
                    <div className="h-5 w-9 rounded-full bg-zinc-200 after:absolute after:left-[2px] after:top-[2px] after:size-4 after:rounded-full after:bg-white after:transition-all peer-checked:bg-emerald-500 peer-checked:after:translate-x-full peer-disabled:opacity-50" />
                  </label>
                </td>
                <td className="px-4 py-3 text-right text-zinc-500">
                  {activating === p.id ? (
                    <Input
                      type="number"
                      min={0}
                      value={initialQty}
                      onChange={(e) => setInitialQty(e.target.value)}
                      className="ml-auto w-20 text-right"
                    />
                  ) : (
                    p.currentQty ?? "—"
                  )}
                </td>
                <td className="px-4 py-3 text-right text-zinc-500">
                  {activating === p.id ? (
                    <div className="flex items-center justify-end gap-2">
                      <Input
                        type="number"
                        min={0}
                        value={initialMin}
                        onChange={(e) => setInitialMin(e.target.value)}
                        className="w-20 text-right"
                      />
                      <Button
                        size="xs"
                        onClick={() => handleSaveInitial(p.id, p.name)}
                        disabled={pending}
                      >
                        Guardar
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setActivating(null)}
                        disabled={pending}
                      >
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    p.minQty ?? "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
