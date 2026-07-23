"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ProductRow } from "@/components/admin/catalog/product-row";
import type {
  AdminCategory,
  AdminProduct,
} from "@/lib/admin/catalog-query";

const UNCATEGORIZED = "__uncat__";

export function CatalogClient({
  slug,
  categories,
  products,
}: {
  slug: string;
  categories: AdminCategory[];
  products: AdminProduct[];
}) {
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const hasUncategorized = products.some((p) => !p.category_id);

  const filteredProducts = useMemo(() => {
    let result = products;

    if (categoryFilter === UNCATEGORIZED) {
      result = result.filter((p) => !p.category_id);
    } else if (categoryFilter !== null) {
      result = result.filter((p) => p.category_id === categoryFilter);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((p) => p.name.toLowerCase().includes(q));
    }

    return result;
  }, [products, categoryFilter, search]);

  const filterChip = (
    id: string | null,
    label: string,
  ) => (
    <button
      key={id ?? "all"}
      type="button"
      onClick={() => setCategoryFilter(categoryFilter === id ? null : id)}
      className={cn(
        "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
        categoryFilter === id
          ? "bg-primary text-primary-foreground border-primary"
          : "border-border hover:bg-muted",
      )}
    >
      {label}
    </button>
  );

  return (
    <>
      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search className="text-muted-foreground pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
          <Input
            placeholder="Buscar producto…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-full border-zinc-200 bg-white pl-9 pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground absolute right-2.5 top-1/2 -translate-y-1/2"
              aria-label="Limpiar búsqueda"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Filtro por categoría — solo lectura, gestión vive en la tab Categorías. */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {filterChip(null, "Todas")}
        {categories.map((c) => filterChip(c.id, c.name))}
        {hasUncategorized && filterChip(UNCATEGORIZED, "Sin categoría")}
      </div>

      {/* Product list */}
      <ul className="mt-4 grid gap-2">
        {filteredProducts.length === 0 ? (
          <li className="text-muted-foreground py-8 text-center text-sm italic">
            {search
              ? `Sin resultados para "${search}".`
              : categoryFilter
                ? "Sin productos en esta categoría."
                : "Sin productos."}
          </li>
        ) : (
          filteredProducts.map((p) => (
            <ProductRow key={p.id} slug={slug} product={p} />
          ))
        )}
      </ul>

    </>
  );
}
