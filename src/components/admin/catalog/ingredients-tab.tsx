"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  FlaskConical,
  Package,
  Pencil,
  Plus,
  Search,
} from "lucide-react";

import { IngredientDialog } from "@/components/admin/catalog/ingredient-dialog";
import { BrandButton } from "@/components/admin/shell/brand-button";
import { Input } from "@/components/ui/input";
import type { IngredientOverview, IngredientWithPresentations } from "@/lib/ingredients/types";
import { cn } from "@/lib/utils";

type Props = {
  slug: string;
  ingredients: IngredientOverview[];
};

export function IngredientsTab({ slug, ingredients }: Props) {
  const [search, setSearch] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");

  const filtered = useMemo(() => {
    let list = ingredients;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q));
    }
    if (filterActive === "active") list = list.filter((i) => i.isActive);
    if (filterActive === "inactive") list = list.filter((i) => !i.isActive);
    return list;
  }, [ingredients, search, filterActive]);

  // Build ingredient options list for sub-recipe picker
  const ingredientOptions = useMemo(
    () =>
      ingredients
        .filter((i) => i.isActive)
        .map((i) => ({ id: i.id, name: i.name, unit: i.unit })),
    [ingredients],
  );

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-zinc-500" />
          <h2 className="text-base font-bold text-zinc-900">Insumos</h2>
          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-zinc-600">
            {ingredients.length}
          </span>
        </div>
        <IngredientDialog
          slug={slug}
          ingredientOptions={ingredientOptions}
          trigger={
            <BrandButton size="md" leadingIcon={<Plus />}>
              Nuevo insumo
            </BrandButton>
          }
        />
      </header>

      <p className="text-xs text-zinc-500">
        Ingredientes que se usan en recetas. Cada insumo tiene presentaciones
        (envases) con precio de compra, lo que permite calcular el food cost de
        cada producto.
      </p>

      {/* Search + Filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Buscar insumo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 text-xs font-semibold">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilterActive(f)}
              className={cn(
                "rounded-md px-2.5 py-1 transition",
                filterActive === f
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900",
              )}
            >
              {f === "all" ? "Todos" : f === "active" ? "Activos" : "Inactivos"}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-6 text-center">
          <Package className="mx-auto h-6 w-6 text-zinc-400" />
          <p className="mt-2 text-sm font-semibold text-zinc-700">
            {search ? "Sin resultados" : "Sin insumos"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            {search
              ? "Probá con otro término."
              : 'Tocá "Nuevo insumo" para crear el primero.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <IngredientRow
              key={item.id}
              slug={slug}
              item={item}
              ingredientOptions={ingredientOptions}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Row component ────────────────────────────────────────────────

function IngredientRow({
  slug,
  item,
  ingredientOptions,
}: {
  slug: string;
  item: IngredientOverview;
  ingredientOptions: { id: string; name: string; unit: string }[];
}) {
  const costPerUnit =
    item.defaultPresentation && item.defaultPresentation.netQuantity > 0
      ? item.defaultPresentation.costCents / item.defaultPresentation.netQuantity
      : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl bg-white p-3 ring-1 transition",
        item.stockStatus === "out"
          ? "ring-red-200"
          : item.stockStatus === "low"
            ? "ring-amber-200"
            : "ring-zinc-200",
        !item.isActive && "opacity-60",
      )}
    >
      {/* Stock status icon */}
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
          item.stockStatus === "out"
            ? "bg-red-100"
            : item.stockStatus === "low"
              ? "bg-amber-100"
              : "bg-zinc-100",
        )}
      >
        {item.stockStatus === "ok" ? (
          <Package
            className="h-5 w-5 text-zinc-600"
          />
        ) : (
          <AlertTriangle
            className={cn(
              "h-5 w-5",
              item.stockStatus === "out" ? "text-red-600" : "text-amber-600",
            )}
          />
        )}
      </span>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-base font-bold text-zinc-900">
            {item.name}
          </p>
          <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500 uppercase">
            {item.unit}
          </span>
          {item.isComposite && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
              <FlaskConical className="h-2.5 w-2.5" /> compuesto
            </span>
          )}
          {!item.isActive && (
            <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-600">
              inactivo
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>
            Stock: {item.stockQuantity.toFixed(item.unit === "un" ? 0 : 2)} {item.unit}
          </span>
          {item.wastePercent > 0 && (
            <span>Merma: {item.wastePercent}%</span>
          )}
          {costPerUnit != null && (
            <span>
              ${(costPerUnit / 100).toFixed(2)}/{item.unit}
            </span>
          )}
          <span>
            {item.presentationCount}{" "}
            {item.presentationCount === 1 ? "presentación" : "presentaciones"}
          </span>
          <span>
            {item.recipeCount} {item.recipeCount === 1 ? "receta" : "recetas"}
          </span>
        </div>
      </div>

      {/* Edit button */}
      <IngredientDialog
        slug={slug}
        ingredient={{
          ...item,
          presentations: [],
          subRecipe: [],
        }}
        ingredientOptions={ingredientOptions}
        trigger={
          <button
            type="button"
            className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100"
            aria-label="Editar"
          >
            <Pencil className="h-4 w-4" />
          </button>
        }
      />
    </div>
  );
}
