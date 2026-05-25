"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Ban,
  Lock,
  Receipt,
  Scissors,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import type { BusinessRole } from "@/lib/admin/context";
import {
  aplicarPropinaYDescuento,
  cancelarItemEnCuenta,
  dividirPorComensal,
  dividirPorItems,
  dividirPorPersonas,
  limpiarDivision,
} from "@/lib/billing/cuenta-actions";
import type { CuentaState } from "@/lib/billing/types";
import { formatCurrency } from "@/lib/currency";
import { canApplyDiscount, canCancelItem } from "@/lib/permissions/can";
import { cn } from "@/lib/utils";

import { PageShell } from "@/components/admin/shell/page-shell";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

const TIP_PRESETS = [0, 5, 10, 15];
const DISCOUNT_REASONS = [
  { value: "cumpleanos", label: "Cumpleaños" },
  { value: "fidelidad", label: "Fidelidad" },
  { value: "cortesia", label: "Cortesía de la casa" },
  { value: "staff", label: "Staff" },
  { value: "otro", label: "Otro" },
];

type Props = {
  slug: string;
  tableId: string;
  tableLabel: string;
  role: BusinessRole;
  cuenta: CuentaState;
};

export function CuentaClient({
  slug,
  tableId,
  tableLabel,
  role,
  cuenta,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const subtotal = cuenta.totals.subtotal_cents;

  const [tipPercent, setTipPercent] = useState<number | "custom">(
    cuenta.order.tip_cents === 0 ? 0 : "custom",
  );
  const [tipCustomCents, setTipCustomCents] = useState(cuenta.order.tip_cents);
  const tipCents =
    tipPercent === "custom"
      ? tipCustomCents
      : Math.round((subtotal * tipPercent) / 100);

  const [discountPercent, setDiscountPercent] = useState(
    subtotal === 0
      ? 0
      : Math.round((cuenta.order.discount_cents / subtotal) * 100),
  );
  const initialReason = cuenta.order.discount_reason ?? "";
  const initialReasonKnown = DISCOUNT_REASONS.some(
    (r) => r.value === initialReason,
  );
  const [discountReasonValue, setDiscountReasonValue] = useState<string>(
    initialReasonKnown ? initialReason : initialReason ? "otro" : "",
  );
  const [discountReasonOther, setDiscountReasonOther] = useState(
    initialReasonKnown ? "" : initialReason,
  );
  const discountReasonText =
    discountReasonValue === "otro"
      ? discountReasonOther
      : DISCOUNT_REASONS.find((r) => r.value === discountReasonValue)?.label ??
        "";

  const discountCents =
    subtotal === 0 ? 0 : Math.round((subtotal * discountPercent) / 100);
  const total = Math.max(0, subtotal + tipCents - discountCents);

  const [dividirOpen, setDividirOpen] = useState(false);
  const [cancelarItemId, setCancelarItemId] = useState<string | null>(null);

  const dirty =
    tipCents !== cuenta.order.tip_cents ||
    discountCents !== cuenta.order.discount_cents ||
    (discountReasonText || null) !== (cuenta.order.discount_reason || null);

  const cantApplyDiscount =
    discountPercent > 0 && !canApplyDiscount(role, discountPercent);

  const handleConfirmar = () => {
    if (cantApplyDiscount) {
      toast.error("Tu rol no permite ese descuento.");
      return;
    }
    if (discountCents > 0 && discountReasonText.trim() === "") {
      toast.error("El descuento requiere un motivo.");
      return;
    }
    startTransition(async () => {
      if (dirty) {
        const r = await aplicarPropinaYDescuento(
          cuenta.order.id,
          {
            tip_cents: tipCents,
            discount_cents: discountCents,
            discount_reason: discountCents > 0 ? discountReasonText : null,
          },
          slug,
        );
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
      }
      router.push(`/${slug}/mozo/mesa/${tableId}/cobrar`);
    });
  };

  const tramoDescuento =
    role === "mozo" ? "10%" : role === "encargado" ? "25%" : "sin límite";

  return (
    <div className="min-h-dvh bg-zinc-100/60 pb-32">
      {/* Top bar — mobile-first */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-screen-md items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => router.push(`/${slug}/mozo`)}
            className="inline-flex size-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Volver al salón"
          >
            <ArrowRight className="size-4 rotate-180" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {tableLabel}
            </p>
            <h1 className="text-base font-semibold tracking-tight text-zinc-900">
              Cuenta
            </h1>
          </div>
          <div className="text-right">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Total
            </p>
            <p className="text-lg font-bold tracking-tight text-zinc-900 tabular-nums">
              {formatCurrency(total)}
            </p>
          </div>
        </div>
      </header>

      <PageShell width="narrow" className="!py-4 sm:!py-6">
        {/* Banner: división activa */}
        {cuenta.splits.length > 0 && (
          <SplitsBanner
            splits={cuenta.splits}
            onLimpiar={() =>
              startTransition(async () => {
                const r = await limpiarDivision(cuenta.order.id, slug);
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success("División eliminada");
                  router.refresh();
                }
              })
            }
          />
        )}

        {/* Items */}
        <section className="rounded-2xl bg-white ring-1 ring-zinc-200/70">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Detalle
              </p>
              <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
                {cuenta.items.filter((it) => it.cancelled_at === null).length}{" "}
                items
              </h2>
            </div>
            <p className="text-sm font-semibold text-zinc-900 tabular-nums">
              {formatCurrency(subtotal)}
            </p>
          </div>
          <ul className="divide-y divide-zinc-100 border-t border-zinc-100">
            {cuenta.items.map((it, idx) => {
              const cancelled = it.cancelled_at !== null;
              return (
                <li
                  key={it.id}
                  className={cn(
                    "flex items-start justify-between gap-3 px-4 py-3",
                    cancelled && "opacity-50",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="mt-0.5 inline-flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 tabular-nums">
                      {it.quantity}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm font-medium text-zinc-900",
                          cancelled && "line-through",
                        )}
                      >
                        {it.product_name}
                      </p>
                      {(it as { seat_number?: number | null }).seat_number != null && (
                        <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-violet-100 px-1.5 py-0.5 text-[0.6rem] font-semibold text-violet-700">
                          Comensal {(it as { seat_number: number }).seat_number}
                        </span>
                      )}
                      {it.notes && (
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {it.notes}
                        </p>
                      )}
                      {cancelled && (
                        <p className="mt-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-rose-600">
                          Cancelado
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className={cn(
                        "text-sm font-medium text-zinc-900 tabular-nums",
                        cancelled && "line-through",
                      )}
                    >
                      {formatCurrency(it.subtotal_cents)}
                    </span>
                    {!cancelled && canCancelItem(role) && (
                      <button
                        type="button"
                        onClick={() => setCancelarItemId(it.id)}
                        className="inline-flex size-7 items-center justify-center rounded-full text-zinc-400 transition hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Cancelar item"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Propina */}
        <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200/70">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Propina
              </p>
              <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
                Sugerencia para el mozo
              </h2>
            </div>
            <p className="text-sm font-semibold text-zinc-900 tabular-nums">
              {tipCents > 0 ? `+ ${formatCurrency(tipCents)}` : "—"}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {TIP_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setTipPercent(p)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 transition",
                  tipPercent === p
                    ? "bg-zinc-900 text-white ring-zinc-900"
                    : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50",
                )}
              >
                {p === 0 ? "Sin propina" : `${p}%`}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setTipPercent("custom")}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-xs font-semibold ring-1 transition",
                tipPercent === "custom"
                  ? "bg-zinc-900 text-white ring-zinc-900"
                  : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50",
              )}
            >
              Custom
            </button>
          </div>
          {tipPercent === "custom" && (
            <Input
              type="number"
              className="mt-3"
              value={tipCustomCents / 100}
              onChange={(e) =>
                setTipCustomCents(
                  Math.max(0, Math.round(Number(e.target.value) * 100)),
                )
              }
              placeholder="0.00"
              inputMode="decimal"
            />
          )}
        </section>

        {/* Descuento */}
        <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200/70">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Descuento
              </p>
              <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
                Tu rol permite hasta {tramoDescuento}
              </h2>
            </div>
            <p className="text-sm font-semibold tabular-nums text-rose-600">
              {discountCents > 0 ? `− ${formatCurrency(discountCents)}` : "—"}
            </p>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <Input
              type="number"
              value={discountPercent}
              onChange={(e) =>
                setDiscountPercent(
                  Math.max(0, Math.min(100, Number(e.target.value))),
                )
              }
              placeholder="0"
              className="w-24"
              inputMode="decimal"
            />
            <span className="text-sm text-zinc-500">%</span>
          </div>
          {cantApplyDiscount && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[0.65rem] font-semibold text-rose-700">
              <Lock className="size-3" />
              Excede tu autorización · pedile al encargado
            </div>
          )}
          {discountCents > 0 && (
            <div className="mt-3 grid gap-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {DISCOUNT_REASONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setDiscountReasonValue(r.value)}
                    className={cn(
                      "rounded-lg px-2.5 py-2 text-xs font-medium ring-1 transition",
                      discountReasonValue === r.value
                        ? "bg-zinc-900 text-white ring-zinc-900"
                        : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              {discountReasonValue === "otro" && (
                <Input
                  value={discountReasonOther}
                  onChange={(e) => setDiscountReasonOther(e.target.value)}
                  placeholder="Especificá el motivo"
                />
              )}
            </div>
          )}
        </section>

        {/* Resumen + dividir */}
        <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200/70">
          <ResumenRow label="Subtotal" value={formatCurrency(subtotal)} />
          {tipCents > 0 && (
            <ResumenRow
              label="Propina"
              value={`+ ${formatCurrency(tipCents)}`}
            />
          )}
          {discountCents > 0 && (
            <ResumenRow
              label="Descuento"
              value={`− ${formatCurrency(discountCents)}`}
              tone="discount"
            />
          )}
          <div className="mt-2 flex items-baseline justify-between border-t border-zinc-200 pt-2">
            <span className="text-sm font-semibold text-zinc-900">Total</span>
            <span className="text-xl font-bold tracking-tight text-zinc-900 tabular-nums">
              {formatCurrency(total)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDividirOpen(true)}
            disabled={total === 0}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-200 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            <Scissors className="size-4" />
            {cuenta.splits.length > 0
              ? `Volver a dividir (${cuenta.splits.length})`
              : "Dividir cuenta"}
          </button>
        </section>
      </PageShell>

      {/* Sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-screen-md p-4">
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={cantApplyDiscount || total === 0}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-base font-semibold transition hover:brightness-95 disabled:opacity-50"
            style={{
              background: "var(--brand, #18181B)",
              color: "var(--brand-foreground, white)",
            }}
          >
            <Receipt className="size-5" />
            {dirty ? "Guardar y pasar a cobro" : "Pasar a cobro"}
            <span className="ml-1 tabular-nums">{formatCurrency(total)}</span>
          </button>
        </div>
      </div>

      {/* Modales */}
      <DividirModal
        open={dividirOpen}
        onOpenChange={setDividirOpen}
        items={cuenta.items.filter((i) => i.cancelled_at === null)}
        orderId={cuenta.order.id}
        slug={slug}
        onDone={() => {
          setDividirOpen(false);
          router.refresh();
        }}
      />

      <Dialog
        open={cancelarItemId !== null}
        onOpenChange={(o) => !o && setCancelarItemId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar item</DialogTitle>
          </DialogHeader>
          <CancelarItemForm
            onSubmit={(motivo) => {
              if (!cancelarItemId) return;
              startTransition(async () => {
                const r = await cancelarItemEnCuenta(
                  cancelarItemId,
                  motivo,
                  slug,
                );
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success("Item cancelado");
                  setCancelarItemId(null);
                  router.refresh();
                }
              });
            }}
            onCancel={() => setCancelarItemId(null)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResumenRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "discount";
}) {
  return (
    <div className="flex items-baseline justify-between py-0.5 text-sm">
      <span className="text-zinc-600">{label}</span>
      <span
        className={cn(
          "tabular-nums",
          tone === "discount" ? "text-rose-600" : "text-zinc-700",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SplitsBanner({
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
        <Scissors
          className="size-4"
          style={{ color: "var(--brand, #18181B)" }}
        />
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

function CancelarItemForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (motivo: string) => void;
  onCancel: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <>
      <div className="grid gap-1.5">
        <Label>Motivo</Label>
        <Textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          placeholder="Ej: cliente cambió de opinión, plato salió mal…"
          autoFocus
        />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          disabled={motivo.trim() === ""}
          onClick={() => onSubmit(motivo)}
        >
          Confirmar
        </Button>
      </DialogFooter>
    </>
  );
}

// ── Modal dividir ─────────────────────────────────────────────

function DividirModal({
  open,
  onOpenChange,
  items,
  orderId,
  slug,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  items: CuentaState["items"];
  orderId: string;
  slug: string;
  onDone: () => void;
}) {
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<"personas" | "items" | "comensal">("personas");
  const [count, setCount] = useState(2);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [numSplits, setNumSplits] = useState(2);

  const hasSeatNumbers = useMemo(
    () => items.some((it) => (it as { seat_number?: number | null }).seat_number != null),
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
          <TabsList className={cn("mb-4 grid", hasSeatNumbers ? "grid-cols-3" : "grid-cols-2")}>
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
            <Button
              className="w-full"
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
              Confirmar división
            </Button>
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
                Tocá un número junto a cada item para asignarlo a esa
                sub-cuenta.
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
            <Button
              className="w-full"
              disabled={!allAssigned}
              onClick={() =>
                startTransition(async () => {
                  const grouped: Record<number, string[]> = {};
                  for (let i = 1; i <= numSplits; i++) grouped[i] = [];
                  for (const [itemId, idx] of Object.entries(mapping)) {
                    grouped[idx].push(itemId);
                  }
                  for (const k of Object.keys(grouped)) {
                    if (grouped[Number(k)].length === 0)
                      delete grouped[Number(k)];
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
              {allAssigned ? "Confirmar" : "Asigná todos los items"}
            </Button>
          </TabsContent>
          {hasSeatNumbers && (
            <TabsContent value="comensal" className="space-y-4">
              <div className="rounded-xl bg-violet-50 p-3 ring-1 ring-violet-100">
                <p className="text-sm font-semibold text-violet-900">
                  Dividir por comensal
                </p>
                <p className="mt-1 text-xs text-violet-700">
                  Se agrupan automáticamente los items por número de comensal asignado al pedir.
                </p>
              </div>
              <ul className="max-h-56 space-y-1 overflow-y-auto">
                {(() => {
                  const seatMap = new Map<number | null, typeof items>();
                  for (const it of items) {
                    const key = (it as { seat_number?: number | null }).seat_number ?? null;
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
                    <li
                      key={seat ?? "null"}
                      className="rounded-lg bg-zinc-50 p-2.5"
                    >
                      <p className="text-sm font-semibold text-zinc-900">
                        {seat != null ? `Comensal ${seat}` : "Sin asignar"}
                        <span className="ml-1 text-xs font-normal text-zinc-500">
                          · {seatItems.length} {seatItems.length === 1 ? "item" : "items"}
                        </span>
                      </p>
                      <p className="text-xs text-zinc-500 tabular-nums">
                        {formatCurrency(seatItems.reduce((a, it) => a + it.subtotal_cents, 0))}
                      </p>
                    </li>
                  ));
                })()}
              </ul>
              <Button
                className="w-full"
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
                Confirmar división por comensal
              </Button>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
