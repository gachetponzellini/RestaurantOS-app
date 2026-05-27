"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChefHat, Play, Receipt } from "lucide-react";
import { toast } from "sonner";

import {
  advanceComandaStatus,
  marcarComandaEntregada,
} from "@/lib/comandas/actions";
import { formatCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils";

export type ComandaSummary = {
  id: string;
  batch: number;
  status: "pendiente" | "en_preparacion" | "entregado";
  station_name: string;
  emitted_at: string;
  delivered_at: string | null;
  items: { product_name: string; quantity: number }[];
};

export type OrderSummaryData = {
  order_number: number;
  total_cents: number;
  items: { product_name: string; quantity: number; cancelled_at: string | null }[];
  comandas: ComandaSummary[];
};

/**
 * Card compartida entre la vista mozo y la vista admin del salón.
 * Muestra el resumen del pedido (items + total) y las comandas por sector
 * con su estado. Si una comanda está en `en_preparacion`, sale el botón
 * "Entregar" para que el mozo / admin la marque al levantar el plato.
 *
 * `pendiente` = todavía no se imprimió (cocina no la recibió). No se puede
 * entregar algo que cocina ni siquiera empezó. La transición pendiente →
 * en_preparacion la disparará la impresora térmica (Bloque 4b).
 */
export function OrderSummaryCard({
  order,
  slug,
  /** Cuando true, si TODAS las comandas están entregadas, el bloque entero
   *  de comandas se omite — útil para mesas que pidieron la cuenta, donde
   *  cocina ya no tiene nada pendiente y la lista ocupa espacio sin valor.
   *  Default false (siempre se ve el bloque mientras haya comandas). */
  hideComandasIfAllDelivered = false,
}: {
  order: OrderSummaryData;
  slug: string;
  hideComandasIfAllDelivered?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const active = order.items.filter((it) => it.cancelled_at === null);
  const cancelled = order.items.filter((it) => it.cancelled_at !== null);
  const totalQty = active.reduce((acc, it) => acc + it.quantity, 0);

  const handleEmpezar = (comandaId: string) => {
    startTransition(async () => {
      const r = await advanceComandaStatus(comandaId, slug);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  };

  const handleMarcarEntregada = (comandaId: string) => {
    startTransition(async () => {
      const r = await marcarComandaEntregada(comandaId, slug);
      if (!r.ok) toast.error(r.error);
      else router.refresh();
    });
  };

  // Cantidad de activas (no entregadas) para el header.
  const activeComandasCount = order.comandas.filter(
    (c) => c.status !== "entregado",
  ).length;

  // Si la mesa pidió cuenta Y cocina ya entregó todo, el bloque comandas
  // no aporta — lo escondemos para que la card sea más limpia.
  const allComandasDelivered =
    order.comandas.length > 0 &&
    order.comandas.every((c) => c.status === "entregado");
  const showComandas =
    order.comandas.length > 0 &&
    !(hideComandasIfAllDelivered && allComandasDelivered);

  return (
    <div className="space-y-3">
      {/* Resumen de items + total */}
      <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
            Orden #{order.order_number}
          </p>
          <p className="inline-flex items-center gap-1.5 text-lg font-bold tabular-nums text-zinc-900">
            <Receipt className="h-4 w-4" />
            {formatCurrency(order.total_cents)}
          </p>
        </div>
        {active.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {active.map((it, i) => (
              <li
                key={`a-${i}`}
                className="flex items-center gap-2 text-sm text-zinc-800"
              >
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[11px] font-bold tabular-nums text-zinc-700 ring-1 ring-zinc-200">
                  {it.quantity}
                </span>
                <span className="flex-1 truncate">{it.product_name}</span>
              </li>
            ))}
            {cancelled.length > 0 &&
              cancelled.map((it, i) => (
                <li
                  key={`c-${i}`}
                  className="flex items-center gap-2 text-xs text-zinc-400 line-through"
                >
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold tabular-nums">
                    {it.quantity}
                  </span>
                  <span className="flex-1 truncate">{it.product_name}</span>
                </li>
              ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-500">
            Sin items cargados todavía.
          </p>
        )}
        {active.length > 0 && (
          <p className="mt-3 border-t border-emerald-100 pt-2 text-[11px] text-zinc-500 tabular-nums">
            {totalQty} items · {active.length}{" "}
            {active.length === 1 ? "producto" : "productos"}
          </p>
        )}
      </div>

      {/* Comandas por sector con su estado */}
      {showComandas && (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
          <div className="flex items-center justify-between gap-2">
            <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
              <ChefHat className="size-3" strokeWidth={2} />
              Comandas
            </p>
            <p className="text-[10px] font-semibold tabular-nums text-zinc-500">
              {activeComandasCount > 0
                ? `${activeComandasCount} activa${activeComandasCount === 1 ? "" : "s"} · ${order.comandas.length} total`
                : `${order.comandas.length} entregada${order.comandas.length === 1 ? "" : "s"}`}
            </p>
          </div>
          <ul className="mt-3 space-y-2">
            {order.comandas
              .slice()
              .sort((a, b) =>
                a.batch === b.batch
                  ? a.station_name.localeCompare(b.station_name)
                  : a.batch - b.batch,
              )
              .map((c) => (
                <ComandaRow
                  key={c.id}
                  comanda={c}
                  isPending={isPending}
                  onEmpezar={() => handleEmpezar(c.id)}
                  onMarcarEntregada={() => handleMarcarEntregada(c.id)}
                />
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function useElapsedMinutes(iso: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const i = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(i);
  }, [iso]);
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}

function formatElapsed(min: number): string {
  if (min < 1) return "ahora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

function ComandaRow({
  comanda,
  isPending,
  onEmpezar,
  onMarcarEntregada,
}: {
  comanda: ComandaSummary;
  isPending: boolean;
  onEmpezar: () => void;
  onMarcarEntregada: () => void;
}) {
  // Cuánto hace que está en su estado actual. Para entregadas usamos
  // delivered_at; para el resto, emitted_at (cuánto hace que viene esperando).
  const referenceIso =
    comanda.status === "entregado" ? comanda.delivered_at : comanda.emitted_at;
  const elapsed = useElapsedMinutes(referenceIso);
  const isUrgent = comanda.status !== "entregado" && elapsed >= 15;
  const isLate = comanda.status !== "entregado" && elapsed >= 8 && elapsed < 15;

  const statusLabel: Record<ComandaSummary["status"], string> = {
    pendiente: "Pendiente",
    en_preparacion: "En preparación",
    entregado: "Entregada",
  };
  const statusClass: Record<ComandaSummary["status"], string> = {
    pendiente: "bg-amber-100 text-amber-800",
    en_preparacion: "bg-sky-100 text-sky-800",
    entregado: "bg-emerald-100 text-emerald-800",
  };
  const dotClass: Record<ComandaSummary["status"], string> = {
    pendiente: "bg-amber-500",
    en_preparacion: "bg-sky-500",
    entregado: "bg-emerald-500",
  };

  return (
    <li
      className={cn(
        "overflow-hidden rounded-xl ring-1 transition",
        comanda.status === "entregado"
          ? "bg-zinc-50 ring-zinc-200"
          : "bg-white ring-zinc-200",
        isUrgent && "ring-rose-300",
        isLate && "ring-amber-300",
      )}
    >
      {/* Row 1: sector + tanda + tiempo */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "size-2 shrink-0 rounded-full",
              dotClass[comanda.status],
            )}
          />
          <span className="truncate text-sm font-bold text-zinc-900">
            {comanda.station_name}
          </span>
          <span className="shrink-0 text-[11px] font-medium text-zinc-500 tabular-nums">
            Tanda {comanda.batch}
          </span>
        </div>
        <span
          className={cn(
            "shrink-0 text-[11px] font-semibold tabular-nums",
            isUrgent ? "text-rose-700" : isLate ? "text-amber-700" : "text-zinc-500",
          )}
        >
          {formatElapsed(elapsed)}
          {comanda.status === "entregado" && " atrás"}
        </span>
      </div>

      {/* Row 2: items */}
      {comanda.items.length > 0 && (
        <ul
          className={cn(
            "mt-2 space-y-0.5 px-3 pb-2 text-xs",
            comanda.status === "entregado" ? "text-zinc-500" : "text-zinc-700",
          )}
        >
          {comanda.items.slice(0, 4).map((it, i) => (
            <li
              key={`${comanda.id}-${i}`}
              className="flex items-baseline gap-1.5"
            >
              <span className="shrink-0 font-semibold tabular-nums text-zinc-500">
                {it.quantity}×
              </span>
              <span className="truncate font-medium">{it.product_name}</span>
            </li>
          ))}
          {comanda.items.length > 4 && (
            <li className="text-zinc-400">+{comanda.items.length - 4} más</li>
          )}
        </ul>
      )}

      {/* Row 3: chip de estado + acción primaria */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-t px-3 py-2",
          comanda.status === "entregado"
            ? "border-zinc-200/70 bg-zinc-50"
            : "border-zinc-100 bg-zinc-50/50",
        )}
      >
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
            statusClass[comanda.status],
          )}
        >
          <span className={cn("size-1.5 rounded-full", dotClass[comanda.status])} />
          {statusLabel[comanda.status]}
        </span>

        {comanda.status === "pendiente" && (
          <button
            type="button"
            onClick={onEmpezar}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-sky-700 active:translate-y-px disabled:opacity-50"
          >
            <Play className="size-3.5" strokeWidth={2.5} />
            Empezar
          </button>
        )}
        {comanda.status === "en_preparacion" && (
          <button
            type="button"
            onClick={onMarcarEntregada}
            disabled={isPending}
            className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-emerald-700 active:translate-y-px disabled:opacity-50"
          >
            <Check className="size-3.5" strokeWidth={2.5} />
            Entregar
          </button>
        )}
        {/* entregado: sin botón, solo el chip */}
      </div>
    </li>
  );
}
