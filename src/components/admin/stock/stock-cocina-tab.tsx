"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Box,
  Minus,
  Package,
  Plus,
  Search,
  X,
  XCircle,
} from "lucide-react";

import type {
  KitchenStockFull,
  KitchenStockPresentation,
} from "@/lib/ingredients/queries";
import type { IngredientUnit } from "@/lib/ingredients/types";
import { ingresarStockCocina, ajustarStockCocina } from "@/lib/ingredients/actions";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────

function fmtQty(qty: number, unit: IngredientUnit): string {
  return unit === "un"
    ? `${qty.toFixed(0)} ${unit}`
    : `${qty.toFixed(2)} ${unit}`;
}

const STATUS_CFG = {
  ok: {
    label: "OK",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
    dot: "bg-emerald-500",
  },
  low: {
    label: "Bajo",
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
    dot: "bg-amber-500",
  },
  out: {
    label: "Agotado",
    bg: "bg-red-50",
    text: "text-red-700",
    ring: "ring-red-200",
    dot: "bg-red-500",
  },
} as const;

type FilterStatus = "all" | "low" | "out";

// ── Main component ──────────────────────────────────────────────

export function StockCocinaTab({
  slug,
  items: initialItems,
}: {
  slug: string;
  items: KitchenStockFull[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");

  // Modals
  const [ingresoTarget, setIngresoTarget] = useState<KitchenStockFull | null>(null);
  const [ajusteTarget, setAjusteTarget] = useState<KitchenStockFull | null>(null);

  const filtered = useMemo(() => {
    let result = items;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter((i) => i.name.toLowerCase().includes(q));
    }
    if (filterStatus === "low") {
      result = result.filter((i) => i.stockStatus === "low" || i.stockStatus === "out");
    } else if (filterStatus === "out") {
      result = result.filter((i) => i.stockStatus === "out");
    }
    return result;
  }, [items, search, filterStatus]);

  const alertCount = useMemo(
    () => items.filter((i) => i.stockStatus !== "ok").length,
    [items],
  );

  // Optimistic update after ingreso
  const handleIngresoSuccess = useCallback(
    (ingredientId: string, addedBaseUnits: number) => {
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== ingredientId) return i;
          const newQty = i.stockQuantity + addedBaseUnits;
          const minAlert = i.stockMinAlert;
          let stockStatus: "ok" | "low" | "out" = "ok";
          if (newQty <= 0) stockStatus = "out";
          else if (minAlert != null && newQty <= minAlert) stockStatus = "low";
          return { ...i, stockQuantity: newQty, stockStatus };
        }),
      );
    },
    [],
  );

  // Optimistic update after ajuste
  const handleAjusteSuccess = useCallback(
    (ingredientId: string, delta: number) => {
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== ingredientId) return i;
          const newQty = i.stockQuantity + delta;
          const minAlert = i.stockMinAlert;
          let stockStatus: "ok" | "low" | "out" = "ok";
          if (newQty <= 0) stockStatus = "out";
          else if (minAlert != null && newQty <= minAlert) stockStatus = "low";
          return { ...i, stockQuantity: newQty, stockStatus };
        }),
      );
    },
    [],
  );

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            Stock de cocina
          </h2>
          <p className="text-sm text-zinc-500">
            {items.length} insumos activos
            {alertCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                <AlertTriangle className="size-3.5" />
                {alertCount} con alerta
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Status filter */}
          <div className="inline-flex rounded-lg bg-white p-0.5 ring-1 ring-zinc-200">
            {(
              [
                { key: "all", label: "Todos" },
                { key: "low", label: "Alertas" },
                { key: "out", label: "Agotados" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setFilterStatus(opt.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  filterStatus === opt.key
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-900",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar insumo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-56 rounded-lg border border-zinc-200 bg-white pl-9 pr-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-400">
          <Box className="size-10 opacity-40" />
          <p className="text-sm">
            {search || filterStatus !== "all"
              ? "No hay insumos que coincidan."
              : "No hay insumos cargados."}
          </p>
        </div>
      ) : (
        <div className="overflow-auto rounded-xl bg-white ring-1 ring-zinc-200/60">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                <th className="py-3 pl-4 pr-2">Insumo</th>
                <th className="px-2 py-3">Unidad</th>
                <th className="px-2 py-3 text-right">Stock</th>
                <th className="px-2 py-3 text-right">Min.</th>
                <th className="px-2 py-3 text-center">Estado</th>
                <th className="py-3 pl-2 pr-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {filtered.map((item) => {
                const cfg = STATUS_CFG[item.stockStatus];
                return (
                  <tr
                    key={item.id}
                    className={cn(
                      "transition hover:bg-zinc-50",
                      item.stockStatus === "out" && "bg-red-50/30",
                      item.stockStatus === "low" && "bg-amber-50/20",
                    )}
                  >
                    <td className="py-3 pl-4 pr-2 font-medium text-zinc-900">
                      {item.name}
                    </td>
                    <td className="px-2 py-3 text-zinc-500">{item.unit}</td>
                    <td className="px-2 py-3 text-right tabular-nums text-zinc-900">
                      {fmtQty(item.stockQuantity, item.unit)}
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums text-zinc-500">
                      {item.stockMinAlert != null
                        ? fmtQty(item.stockMinAlert, item.unit)
                        : "—"}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
                          cfg.bg,
                          cfg.text,
                          cfg.ring,
                        )}
                      >
                        <span
                          className={cn("size-1.5 rounded-full", cfg.dot)}
                        />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="py-3 pl-2 pr-4 text-right">
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => setIngresoTarget(item)}
                          title="Ingresar stock"
                          className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <Plus className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setAjusteTarget(item)}
                          title="Ajustar stock"
                          className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-blue-50 hover:text-blue-700"
                        >
                          <ArrowUp className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Ingreso modal */}
      {ingresoTarget && (
        <IngresoModal
          slug={slug}
          ingredient={ingresoTarget}
          onClose={() => setIngresoTarget(null)}
          onSuccess={handleIngresoSuccess}
        />
      )}

      {/* Ajuste modal */}
      {ajusteTarget && (
        <AjusteModal
          slug={slug}
          ingredient={ajusteTarget}
          onClose={() => setAjusteTarget(null)}
          onSuccess={handleAjusteSuccess}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// INGRESO MODAL
// ═══════════════════════════════════════════════════════════════════

function IngresoModal({
  slug,
  ingredient,
  onClose,
  onSuccess,
}: {
  slug: string;
  ingredient: KitchenStockFull;
  onClose: () => void;
  onSuccess: (ingredientId: string, addedBaseUnits: number) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedPresId, setSelectedPresId] = useState<string>(
    ingredient.presentations[0]?.id ?? "",
  );
  const [units, setUnits] = useState<string>("1");
  const [error, setError] = useState<string | null>(null);

  const selectedPres = ingredient.presentations.find(
    (p) => p.id === selectedPresId,
  );
  const unitsNum = Number(units);
  const totalBase =
    selectedPres && unitsNum > 0
      ? unitsNum * selectedPres.netQuantity
      : 0;

  const handleSubmit = () => {
    if (!selectedPresId || unitsNum <= 0) {
      setError("Ingresá una cantidad mayor a 0.");
      return;
    }

    startTransition(async () => {
      const result = await ingresarStockCocina(slug, {
        ingredient_id: ingredient.id,
        presentation_id: selectedPresId,
        units: unitsNum,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess(ingredient.id, totalBase);
      router.refresh();
      onClose();
    });
  };

  if (ingredient.presentations.length === 0) {
    return (
      <ModalOverlay onClose={onClose}>
        <div className="space-y-4">
          <ModalHeader
            title={`Ingresar: ${ingredient.name}`}
            onClose={onClose}
          />
          <div className="rounded-xl bg-amber-50 p-4 text-center ring-1 ring-amber-200">
            <p className="text-sm font-medium text-amber-800">
              Este insumo no tiene presentaciones cargadas.
            </p>
            <p className="mt-1 text-xs text-amber-600">
              Agregale al menos una presentación desde el catálogo para poder
              ingresar stock.
            </p>
          </div>
        </div>
      </ModalOverlay>
    );
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="space-y-5">
        <ModalHeader
          title={`Ingresar: ${ingredient.name}`}
          onClose={onClose}
        />

        {/* Current stock info */}
        <div className="rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200/60">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Stock actual
          </p>
          <p className="text-lg font-bold tabular-nums text-zinc-900">
            {fmtQty(ingredient.stockQuantity, ingredient.unit)}
          </p>
        </div>

        {/* Presentation select */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-700">
            Presentación
          </label>
          <select
            value={selectedPresId}
            onChange={(e) => setSelectedPresId(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
          >
            {ingredient.presentations.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.netQuantity} {ingredient.unit})
              </option>
            ))}
          </select>
        </div>

        {/* Units */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-700">
            Cantidad de envases
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setUnits((prev) => String(Math.max(1, Number(prev) - 1)))
              }
              className="flex size-10 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
            >
              <Minus className="size-4" />
            </button>
            <input
              type="number"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              min={1}
              step={1}
              className="h-10 w-20 rounded-lg border border-zinc-200 bg-white text-center text-sm tabular-nums outline-none transition focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
            />
            <button
              type="button"
              onClick={() =>
                setUnits((prev) => String(Number(prev) + 1))
              }
              className="flex size-10 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50"
            >
              <Plus className="size-4" />
            </button>
          </div>
        </div>

        {/* Preview */}
        {totalBase > 0 && (
          <div className="rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
            <p className="text-sm text-emerald-800">
              Se sumarán{" "}
              <span className="font-bold">
                {fmtQty(totalBase, ingredient.unit)}
              </span>{" "}
              al stock actual.
            </p>
            <p className="text-xs text-emerald-600">
              Nuevo stock:{" "}
              <span className="font-semibold">
                {fmtQty(ingredient.stockQuantity + totalBase, ingredient.unit)}
              </span>
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || unitsNum <= 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {isPending ? (
              <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <Package className="size-4" />
            )}
            Ingresar
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ═══════════════════════════════════════════════════════════════════
// AJUSTE MODAL
// ═══════════════════════════════════════════════════════════════════

function AjusteModal({
  slug,
  ingredient,
  onClose,
  onSuccess,
}: {
  slug: string;
  ingredient: KitchenStockFull;
  onClose: () => void;
  onSuccess: (ingredientId: string, delta: number) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [quantity, setQuantity] = useState<string>("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const qtyNum = Number(quantity);
  const isValid = qtyNum !== 0 && reason.trim().length > 0;

  const handleSubmit = () => {
    if (!isValid) {
      setError(
        !reason.trim()
          ? "El motivo es obligatorio."
          : "La cantidad no puede ser 0.",
      );
      return;
    }

    startTransition(async () => {
      const result = await ajustarStockCocina(slug, {
        ingredient_id: ingredient.id,
        quantity: qtyNum,
        reason: reason.trim(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSuccess(ingredient.id, qtyNum);
      router.refresh();
      onClose();
    });
  };

  const newStock = ingredient.stockQuantity + qtyNum;

  return (
    <ModalOverlay onClose={onClose}>
      <div className="space-y-5">
        <ModalHeader
          title={`Ajustar: ${ingredient.name}`}
          onClose={onClose}
        />

        {/* Current stock info */}
        <div className="rounded-xl bg-zinc-50 px-4 py-3 ring-1 ring-zinc-200/60">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Stock actual
          </p>
          <p className="text-lg font-bold tabular-nums text-zinc-900">
            {fmtQty(ingredient.stockQuantity, ingredient.unit)}
          </p>
        </div>

        {/* Quantity (positive = add, negative = subtract) */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-700">
            Ajuste ({ingredient.unit})
          </label>
          <p className="text-xs text-zinc-500">
            Positivo para sumar, negativo para restar.
          </p>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            step={ingredient.unit === "un" ? 1 : 0.01}
            placeholder="Ej: -2.5 o +10"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
          />
        </div>

        {/* Reason */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-zinc-700">
            Motivo <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Merma por vencimiento, conteo físico..."
            maxLength={200}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200"
          />
        </div>

        {/* Preview */}
        {qtyNum !== 0 && (
          <div
            className={cn(
              "rounded-xl px-4 py-3 ring-1",
              qtyNum > 0
                ? "bg-emerald-50 ring-emerald-200"
                : "bg-orange-50 ring-orange-200",
            )}
          >
            <p
              className={cn(
                "text-sm",
                qtyNum > 0 ? "text-emerald-800" : "text-orange-800",
              )}
            >
              {qtyNum > 0 ? "Se sumarán" : "Se restarán"}{" "}
              <span className="font-bold">
                {fmtQty(Math.abs(qtyNum), ingredient.unit)}
              </span>
            </p>
            <p
              className={cn(
                "text-xs",
                qtyNum > 0 ? "text-emerald-600" : "text-orange-600",
              )}
            >
              Nuevo stock:{" "}
              <span className="font-semibold">
                {fmtQty(newStock, ingredient.unit)}
              </span>
              {newStock < 0 && (
                <span className="ml-2 text-red-600">(negativo)</span>
              )}
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !isValid}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50"
          >
            {isPending ? (
              <div className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <ArrowDown className="size-4" />
            )}
            Ajustar
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SHARED UI
// ═══════════════════════════════════════════════════════════════════

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        {children}
      </div>
    </div>
  );
}

function ModalHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
