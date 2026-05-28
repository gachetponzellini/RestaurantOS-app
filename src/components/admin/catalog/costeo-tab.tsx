"use client";

import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  DollarSign,
  Filter,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import type { ProductCosteo } from "@/lib/ingredients/types";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

type SortKey = "margin" | "name" | "cost" | "price";
type SortDir = "asc" | "desc";

function marginColor(pct: number, hasRecipe: boolean): string {
  if (!hasRecipe) return "text-zinc-400";
  if (pct >= 65) return "text-emerald-700";
  if (pct >= 50) return "text-emerald-600";
  if (pct >= 30) return "text-amber-600";
  return "text-red-600";
}

function marginBg(pct: number, hasRecipe: boolean): string {
  if (!hasRecipe) return "bg-zinc-50";
  if (pct >= 65) return "bg-emerald-50";
  if (pct >= 50) return "bg-emerald-50/50";
  if (pct >= 30) return "bg-amber-50/50";
  return "bg-red-50/50";
}

export function CosteoTab({ items }: { items: ProductCosteo[] }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [recipeFilter, setRecipeFilter] = useState<"all" | "with" | "without">(
    "all",
  );
  const [sortKey, setSortKey] = useState<SortKey>("margin");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Unique categories for filter
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.categoryName) set.add(i.categoryName);
    });
    return Array.from(set).sort();
  }, [items]);

  // Filter + sort
  const filtered = useMemo(() => {
    let result = items;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.productName.toLowerCase().includes(q));
    }
    if (categoryFilter !== "all") {
      result = result.filter((i) => i.categoryName === categoryFilter);
    }
    if (recipeFilter === "with") {
      result = result.filter((i) => i.hasRecipe);
    } else if (recipeFilter === "without") {
      result = result.filter((i) => !i.hasRecipe);
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "margin":
          cmp = a.marginPercent - b.marginPercent;
          break;
        case "name":
          cmp = a.productName.localeCompare(b.productName);
          break;
        case "cost":
          cmp = a.foodCostCents - b.foodCostCents;
          break;
        case "price":
          cmp = a.priceCents - b.priceCents;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [items, search, categoryFilter, recipeFilter, sortKey, sortDir]);

  // Summary stats — only from items with recipes
  const stats = useMemo(() => {
    const withRecipe = items.filter((i) => i.hasRecipe && i.priceCents > 0);
    if (withRecipe.length === 0) {
      return { avgMargin: 0, totalCost: 0, totalRevenue: 0, count: 0 };
    }
    const totalCost = withRecipe.reduce((s, i) => s + i.foodCostCents, 0);
    const totalRevenue = withRecipe.reduce((s, i) => s + i.priceCents, 0);
    const avgMargin =
      totalRevenue > 0
        ? ((totalRevenue - totalCost) / totalRevenue) * 100
        : 0;
    return {
      avgMargin: Math.round(avgMargin * 100) / 100,
      totalCost,
      totalRevenue,
      count: withRecipe.length,
    };
  }, [items]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "asc");
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col)
      return <ArrowDown className="size-3 opacity-0 group-hover:opacity-30" />;
    return sortDir === "asc" ? (
      <ArrowUp className="size-3" />
    ) : (
      <ArrowDown className="size-3" />
    );
  };

  const withRecipeCount = items.filter((i) => i.hasRecipe).length;
  const withoutRecipeCount = items.length - withRecipeCount;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Margen promedio"
          value={`${stats.avgMargin.toFixed(1)}%`}
          detail={`${stats.count} productos con receta`}
          icon={
            stats.avgMargin >= 50 ? (
              <TrendingUp className="size-5 text-emerald-600" />
            ) : (
              <TrendingDown className="size-5 text-amber-600" />
            )
          }
          accent={stats.avgMargin >= 50 ? "emerald" : "amber"}
        />
        <SummaryCard
          label="Con receta"
          value={String(withRecipeCount)}
          detail={`de ${items.length} productos`}
          icon={<DollarSign className="size-5 text-sky-600" />}
          accent="sky"
        />
        <SummaryCard
          label="Sin receta"
          value={String(withoutRecipeCount)}
          detail="sin food cost calculable"
          icon={<Filter className="size-5 text-zinc-500" />}
          accent="zinc"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-56 rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
          />
        </div>

        {/* Category filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
        >
          <option value="all">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        {/* Recipe filter */}
        <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-zinc-200">
          {(
            [
              { key: "all", label: "Todos" },
              { key: "with", label: "Con receta" },
              { key: "without", label: "Sin receta" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setRecipeFilter(opt.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                recipeFilter === opt.key
                  ? "bg-zinc-900 text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center text-sm text-zinc-500 ring-1 ring-zinc-200/70">
          {search || categoryFilter !== "all" || recipeFilter !== "all"
            ? "No hay productos que coincidan con los filtros."
            : "No hay productos activos."}
        </div>
      ) : (
        <div className="overflow-auto rounded-xl bg-white ring-1 ring-zinc-200/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                <th
                  className="group cursor-pointer py-3 pl-4 pr-2"
                  onClick={() => toggleSort("name")}
                >
                  <span className="inline-flex items-center gap-1">
                    Producto <SortIcon col="name" />
                  </span>
                </th>
                <th className="px-2 py-3">Categoría</th>
                <th
                  className="group cursor-pointer px-2 py-3 text-right"
                  onClick={() => toggleSort("price")}
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    Precio <SortIcon col="price" />
                  </span>
                </th>
                <th
                  className="group cursor-pointer px-2 py-3 text-right"
                  onClick={() => toggleSort("cost")}
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    Food cost <SortIcon col="cost" />
                  </span>
                </th>
                <th
                  className="group cursor-pointer px-2 py-3 text-right"
                  onClick={() => toggleSort("margin")}
                >
                  <span className="inline-flex items-center justify-end gap-1">
                    Margen <SortIcon col="margin" />
                  </span>
                </th>
                <th className="py-3 pl-2 pr-4 text-right">Margen $</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((item) => (
                <tr
                  key={item.productId}
                  className={cn("transition hover:bg-zinc-50", marginBg(item.marginPercent, item.hasRecipe))}
                >
                  <td className="py-3 pl-4 pr-2 font-medium text-zinc-900">
                    {item.productName}
                  </td>
                  <td className="px-2 py-3 text-zinc-500">
                    {item.categoryName ?? "—"}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums text-zinc-900">
                    {formatCurrency(item.priceCents)}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {item.hasRecipe ? (
                      <span className="text-zinc-900">
                        {formatCurrency(item.foodCostCents)}
                      </span>
                    ) : (
                      <span className="italic text-zinc-400">sin receta</span>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {item.hasRecipe ? (
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 font-semibold",
                          marginColor(item.marginPercent, item.hasRecipe),
                        )}
                      >
                        {item.marginPercent.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="py-3 pl-2 pr-4 text-right tabular-nums">
                    {item.hasRecipe ? (
                      <span
                        className={marginColor(
                          item.marginPercent,
                          item.hasRecipe,
                        )}
                      >
                        {formatCurrency(item.marginCents)}
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Summary card ─────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  detail,
  icon,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  accent: "emerald" | "amber" | "sky" | "zinc";
}) {
  const borderMap = {
    emerald: "ring-emerald-100",
    amber: "ring-amber-100",
    sky: "ring-sky-100",
    zinc: "ring-zinc-200",
  };

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl bg-white p-4 ring-1",
        borderMap[accent],
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-50">
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {label}
        </p>
        <p className="text-xl font-bold tabular-nums text-zinc-900">
          {value}
        </p>
        <p className="text-xs text-zinc-500">{detail}</p>
      </div>
    </div>
  );
}
