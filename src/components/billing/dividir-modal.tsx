"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Scissors, Users } from "lucide-react";
import { toast } from "sonner";

import {
  dividirPorComensal,
  dividirPorItems,
  dividirPorPersonas,
} from "@/lib/billing/cuenta-actions";
import type { CuentaState } from "@/lib/billing/types";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ── Banner: división activa ───────────────────────────────────────────────
//
// Compartido por la vista de cuenta (mozo) y el cobro embebido (encargado).

export function SplitsBanner({
  splits,
  onLimpiar,
}: {
  splits: CuentaState["splits"];
  onLimpiar: () => void;
}) {
  const totalAsignado = splits.reduce(
    (acc, s) => acc + s.expected_amount_cents,
    0,
  );
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-2xl p-4"
      style={{ background: "var(--brand-soft, #F4F4F5)" }}
    >
      <div className="flex size-9 items-center justify-center rounded-full bg-white">
        <Scissors className="size-4" style={{ color: "var(--brand, #18181B)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">
          Cuenta dividida en {splits.length}{" "}
          {splits.length === 1 ? "sub-cuenta" : "sub-cuentas"}
        </p>
        <p className="text-xs text-zinc-600 tabular-nums">
          Total asignado: {formatCurrency(totalAsignado)}
        </p>
      </div>
      <button
        type="button"
        onClick={onLimpiar}
        className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
      >
        <Ban className="size-3" />
        Limpiar
      </button>
    </div>
  );
}

// ── Modal dividir ─────────────────────────────────────────────────────────

export function DividirModal({
  open,
  onOpenChange,
  items,
  orderId,
  slug,
  parentStartTransition,
  isPending,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: CuentaState["items"];
  orderId: string;
  slug: string;
  parentStartTransition: (cb: () => void | Promise<void>) => void;
  /** Hay una división (u otro refresh) en vuelo: bloquea re-envíos. */
  isPending: boolean;
  onDone: () => void;
}) {
  const startTransition = parentStartTransition;
  const [tab, setTab] = useState<"personas" | "items" | "comensal">("personas");
  const [count, setCount] = useState(2);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [numSplits, setNumSplits] = useState(2);

  const hasSeatNumbers = useMemo(
    () =>
      items.some(
        (it) => (it as { seat_number?: number | null }).seat_number != null,
      ),
    [items],
  );

  useEffect(() => {
    if (!open) {
      setCount(2);
      setMapping({});
      setNumSplits(2);
      setTab("personas");
    }
  }, [open]);

  const allAssigned = useMemo(
    () => items.every((it) => mapping[it.id]),
    [items, mapping],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dividir cuenta</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList
            className={cn(
              "mb-4 grid",
              hasSeatNumbers ? "grid-cols-3" : "grid-cols-2",
            )}
          >
            <TabsTrigger value="personas">
              <Users className="mr-2 size-4" /> Personas
            </TabsTrigger>
            <TabsTrigger value="items">
              <Scissors className="mr-2 size-4" /> Por items
            </TabsTrigger>
            {hasSeatNumbers && (
              <TabsTrigger value="comensal">
                <Users className="mr-2 size-4" /> Comensal
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="personas" className="space-y-4">
            <div>
              <Label>¿Cuántas personas?</Label>
              <div className="mt-2 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setCount(Math.max(2, count - 1))}
                  className="inline-flex size-10 items-center justify-center rounded-full bg-zinc-100 text-lg font-semibold text-zinc-700 transition hover:bg-zinc-200 active:scale-95"
                  aria-label="Restar"
                >
                  −
                </button>
                <span className="w-10 text-center text-3xl font-bold tabular-nums">
                  {count}
                </span>
                <button
                  type="button"
                  onClick={() => setCount(Math.min(20, count + 1))}
                  className="inline-flex size-10 items-center justify-center rounded-full bg-zinc-100 text-lg font-semibold text-zinc-700 transition hover:bg-zinc-200 active:scale-95"
                  aria-label="Sumar"
                >
                  +
                </button>
              </div>
              <p className="mt-2 text-center text-xs text-zinc-500">
                El total se reparte equitativo (2 a 20 personas).
              </p>
            </div>
            <button
              type="button"
              disabled={isPending}
              className="mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground transition hover:bg-primary/90 active:translate-y-px disabled:opacity-50"
              onClick={() =>
                startTransition(async () => {
                  const r = await dividirPorPersonas(orderId, count, slug);
                  if (!r.ok) toast.error(r.error);
                  else {
                    toast.success(`Dividido en ${count}`);
                    onDone();
                  }
                })
              }
            >
              {isPending ? "Dividiendo…" : "Confirmar división"}
            </button>
          </TabsContent>
          <TabsContent value="items" className="space-y-3">
            <div>
              <Label>¿Cuántas sub-cuentas?</Label>
              <div className="mt-2 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(2, numSplits - 1);
                    setNumSplits(next);
                    setMapping((prev) => {
                      const out: Record<string, number> = {};
                      for (const [k, v] of Object.entries(prev)) {
                        if (v <= next) out[k] = v;
                      }
                      return out;
                    });
                  }}
                  className="inline-flex size-10 items-center justify-center rounded-full bg-zinc-100 text-lg font-semibold text-zinc-700 transition hover:bg-zinc-200 active:scale-95"
                  aria-label="Restar"
                >
                  −
                </button>
                <span className="w-10 text-center text-3xl font-bold tabular-nums">
                  {numSplits}
                </span>
                <button
                  type="button"
                  onClick={() => setNumSplits(Math.min(20, numSplits + 1))}
                  className="inline-flex size-10 items-center justify-center rounded-full bg-zinc-100 text-lg font-semibold text-zinc-700 transition hover:bg-zinc-200 active:scale-95"
                  aria-label="Sumar"
                >
                  +
                </button>
              </div>
              <p className="mt-2 text-center text-xs text-zinc-500">
                Tocá un número junto a cada item para asignarlo a esa sub-cuenta.
              </p>
            </div>
            <ul className="max-h-72 space-y-1.5 overflow-y-auto">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">
                      {it.quantity}× {it.product_name}
                    </p>
                    <p className="text-xs text-zinc-500 tabular-nums">
                      {formatCurrency(it.subtotal_cents)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: numSplits }, (_, i) => i + 1).map(
                      (idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() =>
                            setMapping({ ...mapping, [it.id]: idx })
                          }
                          className={cn(
                            "size-7 rounded-full text-xs font-semibold ring-1 transition",
                            mapping[it.id] === idx
                              ? "bg-zinc-900 text-white ring-zinc-900"
                              : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50",
                          )}
                        >
                          {idx}
                        </button>
                      ),
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground transition hover:bg-primary/90 active:translate-y-px disabled:opacity-50"
              disabled={!allAssigned || isPending}
              onClick={() =>
                startTransition(async () => {
                  const grouped: Record<number, string[]> = {};
                  for (let i = 1; i <= numSplits; i++) grouped[i] = [];
                  for (const [itemId, idx] of Object.entries(mapping)) {
                    grouped[idx].push(itemId);
                  }
                  for (const k of Object.keys(grouped)) {
                    if (grouped[Number(k)].length === 0) delete grouped[Number(k)];
                  }
                  const r = await dividirPorItems(orderId, grouped, slug);
                  if (!r.ok) toast.error(r.error);
                  else {
                    toast.success("División por items aplicada");
                    onDone();
                  }
                })
              }
            >
              {isPending
                ? "Dividiendo…"
                : allAssigned
                  ? "Confirmar"
                  : "Asigná todos los items"}
            </button>
          </TabsContent>
          {hasSeatNumbers && (
            <TabsContent value="comensal" className="space-y-4">
              <div className="rounded-xl bg-violet-50 p-3 ring-1 ring-violet-100">
                <p className="text-sm font-semibold text-violet-900">
                  Dividir por comensal
                </p>
                <p className="mt-1 text-xs text-violet-700">
                  Se agrupan automáticamente los items por número de comensal
                  asignado al pedir.
                </p>
              </div>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {(() => {
                  const seatMap = new Map<number | null, typeof items>();
                  for (const it of items) {
                    const key =
                      (it as { seat_number?: number | null }).seat_number ??
                      null;
                    const bucket = seatMap.get(key) ?? [];
                    bucket.push(it);
                    seatMap.set(key, bucket);
                  }
                  const entries = Array.from(seatMap.entries()).sort((a, b) => {
                    if (a[0] === null) return 1;
                    if (b[0] === null) return -1;
                    return a[0] - b[0];
                  });
                  return entries.map(([seat, seatItems]) => (
                    <li key={seat ?? "null"} className="rounded-lg bg-zinc-50 p-2.5">
                      <p className="text-sm font-semibold text-zinc-900">
                        {seat != null ? `Comensal ${seat}` : "Sin asignar"}
                        <span className="ml-1 text-xs font-normal text-zinc-500">
                          · {seatItems.length}{" "}
                          {seatItems.length === 1 ? "item" : "items"}
                        </span>
                      </p>
                      <p className="text-xs text-zinc-500 tabular-nums">
                        {formatCurrency(
                          seatItems.reduce((a, it) => a + it.subtotal_cents, 0),
                        )}
                      </p>
                    </li>
                  ));
                })()}
              </ul>
              <button
                type="button"
                disabled={isPending}
                className="mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground transition hover:bg-primary/90 active:translate-y-px disabled:opacity-50"
                onClick={() =>
                  startTransition(async () => {
                    const r = await dividirPorComensal(orderId, slug);
                    if (!r.ok) toast.error(r.error);
                    else {
                      toast.success("Dividido por comensal");
                      onDone();
                    }
                  })
                }
              >
                {isPending ? "Dividiendo…" : "Confirmar división por comensal"}
              </button>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
