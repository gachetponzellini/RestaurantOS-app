"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { formatCurrency } from "@/lib/currency";
import type {
  CatalogProduct,
  CatalogModifier,
} from "@/lib/mozo/catalog-query";

export type AddToCartItem = {
  product_id: string;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  notes: string;
  modifiers: {
    id: string;
    group_id: string;
    name: string;
    price_delta_cents: number;
  }[];
  line_subtotal_cents: number;
};

type Selection = Record<string, string[]>;

function initialSelection(p: CatalogProduct): Selection {
  const sel: Selection = {};
  for (const g of p.modifier_groups) {
    if (
      g.is_required &&
      g.min_selection === 1 &&
      g.max_selection === 1 &&
      g.modifiers[0]
    ) {
      sel[g.id] = [g.modifiers[0].id];
    } else {
      sel[g.id] = [];
    }
  }
  return sel;
}

function validate(p: CatalogProduct, sel: Selection): string | null {
  for (const g of p.modifier_groups) {
    const count = sel[g.id]?.length ?? 0;
    if (count < g.min_selection)
      return `Elegí al menos ${g.min_selection} en "${g.name}".`;
    if (count > g.max_selection)
      return `Hasta ${g.max_selection} en "${g.name}".`;
  }
  return null;
}

export function ProductModal({
  product,
  open,
  onClose,
  onAdd,
}: {
  product: CatalogProduct | null;
  open: boolean;
  onClose: () => void;
  onAdd: (item: AddToCartItem) => void;
}) {
  const [selection, setSelection] = useState<Selection>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (product) {
      setSelection(initialSelection(product));
      setQuantity(1);
      setNotes("");
    }
  }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lineTotal = useMemo(() => {
    if (!product) return 0;
    const modsTotal = product.modifier_groups.reduce((acc, g) => {
      const selected = selection[g.id] ?? [];
      return (
        acc +
        g.modifiers
          .filter((m) => selected.includes(m.id))
          .reduce((a, m) => a + m.price_delta_cents, 0)
      );
    }, 0);
    return (product.price_cents + modsTotal) * quantity;
  }, [product, selection, quantity]);

  if (!open || !product) return null;

  const toggle = (g: { id: string; max_selection: number }, modId: string) => {
    setSelection((prev) => {
      const current = prev[g.id] ?? [];
      const isOn = current.includes(modId);
      if (isOn) return { ...prev, [g.id]: current.filter((x) => x !== modId) };
      if (g.max_selection === 1) return { ...prev, [g.id]: [modId] };
      if (current.length >= g.max_selection) return prev;
      return { ...prev, [g.id]: [...current, modId] };
    });
  };

  const handleAdd = () => {
    const error = validate(product, selection);
    if (error) {
      toast.error(error);
      return;
    }
    const flatMods: AddToCartItem["modifiers"] = product.modifier_groups
      .flatMap((g) =>
        g.modifiers.filter((m) => selection[g.id]?.includes(m.id)),
      )
      .map((m: CatalogModifier) => ({
        id: m.id,
        group_id: m.group_id,
        name: m.name,
        price_delta_cents: m.price_delta_cents,
      }));
    onAdd({
      product_id: product.id,
      product_name: product.name,
      unit_price_cents: product.price_cents,
      quantity,
      notes: notes.trim().slice(0, 200),
      modifiers: flatMods,
      line_subtotal_cents: lineTotal,
    });
    onClose();
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
      >
        {/* Handle */}
        <div className="flex justify-center py-2">
          <span className="h-1 w-10 rounded-full bg-zinc-200" />
        </div>

        <div className="flex items-start justify-between gap-3 px-5">
          <div className="min-w-0">
            <h3 className="font-heading text-lg font-bold leading-tight text-zinc-900">
              {product.name}
            </h3>
            {product.description && (
              <p className="mt-1 text-sm text-zinc-600">{product.description}</p>
            )}
            <p className="mt-1 text-sm font-bold text-emerald-700 tabular-nums">
              {formatCurrency(product.price_cents)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="-mt-1 rounded-full p-2 text-zinc-500 active:bg-zinc-100"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {product.modifier_groups.length > 0 && (
          <div className="mt-5 space-y-3 px-5">
            {product.modifier_groups.map((g) => (
              <div key={g.id} className="rounded-2xl border border-zinc-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-bold text-zinc-900">{g.name}</h4>
                  <div className="flex items-center gap-1.5">
                    {g.modifiers.every((m) => m.price_delta_cents === 0) && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        sin cargo
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        g.is_required
                          ? "bg-amber-100 text-amber-800"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {g.is_required ? "obligatorio" : "opcional"}
                      {g.max_selection > 1 ? ` · hasta ${g.max_selection}` : ""}
                    </span>
                  </div>
                </div>
                <div className="mt-2 space-y-1.5">
                  {g.modifiers.map((m) => {
                    const selected = (selection[g.id] ?? []).includes(m.id);
                    return (
                      <button
                        key={m.id}
                        onClick={() => toggle(g, m.id)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left text-sm transition active:scale-[0.99] ${
                          selected
                            ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-300"
                            : "bg-zinc-50 ring-1 ring-zinc-100 active:bg-zinc-100"
                        }`}
                      >
                        <span className="flex items-center gap-2.5">
                          <span
                            className={`flex h-5 w-5 shrink-0 items-center justify-center ${
                              g.max_selection === 1 ? "rounded-full" : "rounded-md"
                            } ${
                              selected
                                ? "bg-emerald-600 text-white"
                                : "bg-white ring-1 ring-zinc-300"
                            }`}
                          >
                            {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                          <span className="font-semibold">{m.name}</span>
                        </span>
                        {m.price_delta_cents !== 0 && (
                          <span className="text-xs font-semibold text-zinc-600 tabular-nums">
                            {m.price_delta_cents > 0 ? "+" : ""}
                            {formatCurrency(m.price_delta_cents)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 space-y-1 px-5">
          <label className="block text-xs font-bold uppercase tracking-wide text-zinc-700">
            Observaciones
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 200))}
            placeholder="ej: sin jamón, sin rúcula, bien cocido"
            className="block w-full rounded-2xl border border-zinc-200 px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            rows={2}
          />
          <p className="text-right text-[10px] text-zinc-400">{notes.length}/200</p>
        </div>

        <div className="mx-5 mt-4 flex items-center justify-between rounded-2xl bg-zinc-50 p-2 ring-1 ring-zinc-100">
          <span className="px-2 text-sm font-semibold text-zinc-700">Cantidad</span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="rounded-full bg-white p-2.5 shadow-sm ring-1 ring-zinc-200 active:scale-[0.95] disabled:opacity-40"
              aria-label="Restar"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-8 text-center text-lg font-bold tabular-nums">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity((q) => Math.min(99, q + 1))}
              disabled={quantity >= 99}
              className="rounded-full bg-white p-2.5 shadow-sm ring-1 ring-zinc-200 active:scale-[0.95] disabled:opacity-40"
              aria-label="Sumar"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 px-5">
          <button
            onClick={handleAdd}
            className="flex h-14 w-full items-center justify-between gap-2 rounded-2xl bg-emerald-600 px-5 text-white shadow-sm transition active:scale-[0.98]"
          >
            <span className="text-base font-semibold">Agregar al pedido</span>
            <span className="text-base font-bold tabular-nums">
              {formatCurrency(lineTotal)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
