"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  CreditCard,
  Link as LinkIcon,
  MoreHorizontal,
  QrCode,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import type { BusinessRole } from "@/lib/admin/context";
import {
  anularCobro,
  iniciarPagoMp,
  registrarPago,
  type IniciarCobroResult,
} from "@/lib/billing/cobro-actions";
import type {
  CuentaState,
  OrderSplit,
  PaymentMethod,
} from "@/lib/billing/types";
import type { PaymentMethodConfig } from "@/lib/caja/types";
import { formatCurrency } from "@/lib/currency";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  slug: string;
  tableId: string;
  tableLabel: string;
  role: BusinessRole;
  cuenta: CuentaState;
  init: IniciarCobroResult;
};

export function CobrarClient({
  slug,
  tableId,
  tableLabel,
  role,
  cuenta,
  init,
}: Props) {
  const router = useRouter();
  const splits = init.hasImplicitSplit
    ? [
        implicitSplit(
          cuenta.order.id,
          cuenta.order.business_id,
          cuenta.totals.total_cents,
        ),
      ]
    : init.splits;

  const [activeSplitId, setActiveSplitId] = useState<string | null>(null);
  const [cajaId, setCajaId] = useState<string>(init.cajas[0].id);
  const activeSplit = splits.find((s) => s.id === activeSplitId) ?? null;

  // Stats globales para el header.
  const total = cuenta.totals.total_cents;
  const splitsActivos = splits.filter((s) => s.status !== "cancelled");
  const totalPaid = splitsActivos.reduce(
    (acc, s) => acc + s.paid_amount_cents,
    0,
  );
  const totalPending = Math.max(0, total - totalPaid);
  const progressPct = total === 0 ? 0 : Math.min(100, (totalPaid / total) * 100);
  const allPaid = totalPending === 0;

  return (
    <div className="min-h-dvh bg-zinc-100/60 pb-12">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-screen-md items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() =>
              router.push(`/${slug}/mozo/mesa/${tableId}/cuenta`)
            }
            className="inline-flex size-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
            aria-label="Volver a la cuenta"
          >
            <ArrowRight className="size-4 rotate-180" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              {tableLabel}
            </p>
            <h1 className="text-base font-semibold tracking-tight text-zinc-900">
              Cobrar
            </h1>
          </div>
        </div>
      </header>

      <PageShell width="narrow" className="!py-4 sm:!py-6">
        {/* KPI principal: progreso global */}
        <section
          className="rounded-2xl p-5"
          style={{ background: "var(--brand-soft, #F4F4F5)" }}
        >
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-600">
            {allPaid ? "Cobrado" : "Falta cobrar"}
          </p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-zinc-900 tabular-nums">
            {formatCurrency(allPaid ? total : totalPending)}
          </p>
          <p className="mt-1 text-xs text-zinc-600">
            de {formatCurrency(total)} total
            {totalPaid > 0 && !allPaid && (
              <> · ya cobrado {formatCurrency(totalPaid)}</>
            )}
          </p>
          {/* Barra de progreso */}
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/80">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progressPct}%`,
                background: allPaid
                  ? "rgb(16 185 129)" // emerald-500
                  : "var(--brand, #18181B)",
              }}
            />
          </div>
        </section>

        {/* Selector de caja (si hay >1 activa) */}
        {init.cajas.length > 1 && (
          <section className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200/70">
            <Label className="text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Caja para registrar el cobro
            </Label>
            <Select
              value={cajaId}
              onValueChange={(v) => v && setCajaId(v)}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {init.cajas.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </section>
        )}

        {/* Splits */}
        <section className="space-y-2.5">
          <p className="px-1 text-[0.6rem] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            {splits.length === 1 ? "Pago único" : `${splits.length} sub-cuentas`}
          </p>
          <ul className="space-y-2.5">
            {splits.map((s) => (
              <li key={s.id}>
                <SplitRow
                  split={s}
                  onCobrar={() => setActiveSplitId(s.id)}
                  total={total}
                />
              </li>
            ))}
          </ul>
        </section>

        {/* Anular cobro (admin/encargado) */}
        {(role === "admin" || role === "encargado") && totalPaid > 0 && (
          <AnularCobroSection
            orderId={cuenta.order.id}
            slug={slug}
            onDone={() => router.push(`/${slug}/mozo`)}
          />
        )}

        {/* Mensaje al cerrar */}
        {allPaid && (
          <section className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
            <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500 text-white">
              <CheckCircle2 className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-emerald-900">
                Mesa cobrada
              </p>
              <p className="text-xs text-emerald-700">
                La mesa se va a marcar para limpiar.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/${slug}/mozo`)}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
            >
              Volver al salón
              <ArrowRight className="size-3.5" />
            </button>
          </section>
        )}
      </PageShell>

      {/* Sheet con métodos de pago */}
      {activeSplit && (
        <CobrarSplitSheet
          split={activeSplit}
          orderId={cuenta.order.id}
          cajaId={cajaId}
          slug={slug}
          isImplicit={init.hasImplicitSplit}
          methodConfigs={init.methodConfigs}
          onClose={() => setActiveSplitId(null)}
          onPaid={() => {
            setActiveSplitId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function implicitSplit(
  orderId: string,
  businessId: string,
  totalCents: number,
): OrderSplit {
  return {
    id: "__implicit__",
    order_id: orderId,
    business_id: businessId,
    split_mode: "por_personas",
    split_index: 0,
    expected_amount_cents: totalCents,
    paid_amount_cents: 0,
    status: "pending",
    label: null,
  };
}

// ── SplitRow: card grande con progreso por split ──────────────

function SplitRow({
  split,
  onCobrar,
  total,
}: {
  split: OrderSplit;
  onCobrar: () => void;
  total: number;
}) {
  const remaining = split.expected_amount_cents - split.paid_amount_cents;
  const done = split.status === "paid" || remaining <= 0;
  const cancelled = split.status === "cancelled";
  const pct =
    split.expected_amount_cents === 0
      ? 0
      : Math.min(
          100,
          (split.paid_amount_cents / split.expected_amount_cents) * 100,
        );

  return (
    <article
      className={cn(
        "flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 transition",
        cancelled
          ? "opacity-50 ring-zinc-200/70"
          : done
            ? "ring-emerald-200 bg-emerald-50/40"
            : "ring-zinc-200/70",
      )}
    >
      <div
        className={cn(
          "flex size-10 flex-shrink-0 items-center justify-center rounded-full",
          done
            ? "bg-emerald-500 text-white"
            : cancelled
              ? "bg-zinc-100 text-zinc-400"
              : "bg-zinc-100 text-zinc-700",
        )}
      >
        {done ? (
          <Check className="size-5" />
        ) : (
          <span className="text-sm font-bold">
            {split.split_index === 0 ? "$" : split.split_index}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900">
          {split.split_index === 0
            ? "Mesa completa"
            : `Sub-cuenta ${split.split_index}`}
          <span className="ml-1 text-xs font-normal text-zinc-500 tabular-nums">
            · {formatCurrency(split.expected_amount_cents)}
          </span>
        </p>
        {!done && !cancelled && split.paid_amount_cents > 0 && (
          <>
            <p className="mt-0.5 text-xs text-zinc-500 tabular-nums">
              Pagado {formatCurrency(split.paid_amount_cents)} · falta{" "}
              <span className="font-semibold text-zinc-900">
                {formatCurrency(remaining)}
              </span>
            </p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-zinc-900 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        )}
        {done && (
          <p className="mt-0.5 text-xs font-medium text-emerald-700">Cobrado</p>
        )}
        {cancelled && (
          <p className="mt-0.5 text-xs text-zinc-500">Cancelado</p>
        )}
      </div>
      {!done && !cancelled && (
        <button
          type="button"
          onClick={onCobrar}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold transition hover:brightness-95 active:translate-y-px"
          style={{
            background: "var(--brand, #18181B)",
            color: "var(--brand-foreground, white)",
          }}
        >
          Cobrar
          <ArrowRight className="size-3.5" />
        </button>
      )}
    </article>
  );
}

// ── Sheet de cobro de un split ─────────────────────────────────

const METHODS: Array<{
  value: PaymentMethod;
  label: string;
  description: string;
  icon: typeof Banknote;
}> = [
  {
    value: "cash",
    label: "Efectivo",
    description: "Cobrá en mano. El sistema calcula el vuelto.",
    icon: Banknote,
  },
  {
    value: "card_manual",
    label: "Tarjeta",
    description: "Posnet físico. Anotá los últimos 4 dígitos.",
    icon: CreditCard,
  },
  {
    value: "mp_link",
    label: "Link Mercado Pago",
    description: "Generá un link para enviar al cliente.",
    icon: LinkIcon,
  },
  {
    value: "mp_qr",
    label: "QR Mercado Pago",
    description: "Mostrá un QR para que el cliente escanee.",
    icon: QrCode,
  },
  {
    value: "transfer",
    label: "Transferencia",
    description: "CBU/CVU o alias. Anotá la referencia.",
    icon: Wallet,
  },
  {
    value: "other",
    label: "Otro",
    description: "Cheque, cortesía, etc.",
    icon: MoreHorizontal,
  },
];

function calculateAdjustment(baseCents: number, percent: number): { adjustmentCents: number; finalCents: number } {
  const adjustmentCents = Math.round(baseCents * percent / 100);
  return { adjustmentCents, finalCents: baseCents + adjustmentCents };
}

function CobrarSplitSheet({
  split,
  orderId,
  cajaId,
  slug,
  isImplicit,
  methodConfigs,
  onClose,
  onPaid,
}: {
  split: OrderSplit;
  orderId: string;
  cajaId: string;
  slug: string;
  isImplicit: boolean;
  methodConfigs: PaymentMethodConfig[];
  onClose: () => void;
  onPaid: () => void;
}) {
  const [, startTransition] = useTransition();
  const remaining = split.expected_amount_cents - split.paid_amount_cents;
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const configForMethod = methodConfigs.find((c) => c.method === method);
  const adjustmentPercent = configForMethod?.adjustment_percent ?? 0;
  const { adjustmentCents, finalCents } = calculateAdjustment(remaining, adjustmentPercent);
  const [amount, setAmount] = useState(remaining);
  const [hasSetAmount, setHasSetAmount] = useState(false);
  const [tip, setTip] = useState(0);
  const [lastFour, setLastFour] = useState("");
  const [cardBrand, setCardBrand] = useState<
    "visa" | "mastercard" | "amex" | "otro"
  >("visa");
  const [notes, setNotes] = useState("");
  const [mpInitPoint, setMpInitPoint] = useState<string | null>(null);
  const [mpPaymentId, setMpPaymentId] = useState<string | null>(null);

  useEffect(() => {
    if (method && !hasSetAmount) {
      setAmount(finalCents);
    }
  }, [method, finalCents, hasSetAmount]);

  // Polling MP cada 4s.
  useEffect(() => {
    if (!mpPaymentId) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/billing/payment-status?id=${mpPaymentId}`,
        );
        const data = await res.json();
        if (data?.payment_status === "paid") {
          toast.success("Pago MP confirmado");
          clearInterval(interval);
          onPaid();
        } else if (data?.payment_status === "failed") {
          toast.error("MP rechazó el pago");
          clearInterval(interval);
          setMpPaymentId(null);
          setMpInitPoint(null);
          setMethod(null);
        }
      } catch {
        // ignore polling errors
      }
    }, 4_000);
    return () => clearInterval(interval);
  }, [mpPaymentId, onPaid]);

  const handleConfirm = () => {
    if (!method) return;
    if (method === "mp_link" || method === "mp_qr") {
      startTransition(async () => {
        const r = await iniciarPagoMp({
          orderId,
          splitId: isImplicit ? null : split.id,
          method,
          amount_cents: amount,
          tip_cents: tip,
          caja_id: cajaId,
          slug,
        });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        setMpInitPoint(r.data.initPoint);
        setMpPaymentId(r.data.paymentId);
      });
      return;
    }
    startTransition(async () => {
      const r = await registrarPago({
        orderId,
        splitId: isImplicit ? null : split.id,
        method,
        amount_cents: amount,
        tip_cents: tip,
        caja_id: cajaId,
        last_four:
          method === "card_manual" && lastFour.length === 4
            ? lastFour
            : undefined,
        card_brand: method === "card_manual" ? cardBrand : undefined,
        notes:
          method === "other" || method === "card_manual" || method === "transfer" ? notes : undefined,
        adjustment_percent: adjustmentPercent,
        adjustment_cents: adjustmentCents,
        slug,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Pago registrado");
      onPaid();
    });
  };

  // Vista MP en curso
  if (mpInitPoint) {
    return (
      <Sheet open onOpenChange={onClose}>
        <SheetContent
          side="right"
          className="!w-full !max-w-lg flex flex-col overflow-y-auto"
        >
          <SheetHeader className="border-b border-zinc-100 pb-4">
            <SheetTitle>
              {method === "mp_qr" ? "QR de pago" : "Link de pago"}
            </SheetTitle>
            <SheetDescription>
              Esperando confirmación de Mercado Pago…
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-6">
            <div className="flex size-16 items-center justify-center rounded-full bg-zinc-100">
              <QrCode className="size-7 text-zinc-700" />
            </div>
            {method === "mp_qr" ? (
              <a
                href={mpInitPoint}
                target="_blank"
                rel="noreferrer"
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Abrir QR de checkout MP
              </a>
            ) : (
              <div className="w-full">
                <Label>Link de pago</Label>
                <Input value={mpInitPoint} readOnly className="mt-1.5 text-xs" />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(mpInitPoint);
                      toast.success("Link copiado");
                    } catch {
                      toast.error("No se pudo copiar");
                    }
                  }}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200"
                >
                  Copiar link
                </button>
              </div>
            )}
            <p className="text-center text-xs text-zinc-500">
              Auto-refresh cada 4 segundos. Si MP confirma, se cierra solo.
            </p>
          </div>
          <SheetFooter>
            <Button variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="!w-full !max-w-lg flex flex-col overflow-y-auto"
      >
        <SheetHeader className="border-b border-zinc-100 pb-4">
          <SheetTitle>
            Cobrar{" "}
            <span className="tabular-nums">{formatCurrency(remaining)}</span>
          </SheetTitle>
          <SheetDescription>
            {split.split_index === 0
              ? "Pago único de la mesa"
              : `Sub-cuenta ${split.split_index}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 px-4">
          {/* Cards de método */}
          {!method && (
            <div className="space-y-2">
              {METHODS.map((m) => {
                const Icon = m.icon;
                const mc = methodConfigs.find((c) => c.method === m.value);
                const adj = mc?.adjustment_percent ?? 0;
                const { finalCents: adjFinal } = calculateAdjustment(remaining, adj);
                return (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => { setMethod(m.value); setHasSetAmount(false); }}
                    className="flex w-full items-center gap-3 rounded-xl bg-white p-3 text-left ring-1 ring-zinc-200/70 transition hover:bg-zinc-50 hover:ring-zinc-300"
                  >
                    <div className="flex size-10 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
                      <Icon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-900">
                        {mc?.label ?? m.label}
                        {adj !== 0 && (
                          <span className={cn("ml-1 text-xs font-medium", adj < 0 ? "text-emerald-600" : "text-rose-600")}>
                            {adj > 0 ? "+" : ""}{adj}%
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-zinc-500">{m.description}</p>
                    </div>
                    <span className="text-sm font-semibold text-zinc-900 tabular-nums">
                      {formatCurrency(adjFinal)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Form del método elegido */}
          {method && (
            <div className="space-y-4">
              {/* Header con cambio de método */}
              <button
                type="button"
                onClick={() => setMethod(null)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 transition hover:text-zinc-900"
              >
                <ArrowRight className="size-3 rotate-180" /> Cambiar método
              </button>

              <div className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200/70">
                {(() => {
                  const meta = METHODS.find((m) => m.value === method)!;
                  const Icon = meta.icon;
                  return (
                    <div className="flex items-center gap-3">
                      <div className="flex size-9 items-center justify-center rounded-full bg-white">
                        <Icon className="size-4 text-zinc-700" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">
                          {meta.label}
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Monto */}
              <div className="grid gap-1.5">
                <Label>Monto</Label>
                <Input
                  type="number"
                  value={amount / 100}
                  onChange={(e) => {
                    setAmount(Math.max(0, Math.round(Number(e.target.value) * 100)));
                    setHasSetAmount(true);
                  }}
                  inputMode="decimal"
                />
                {adjustmentPercent !== 0 && (
                  <p className={cn("text-xs font-medium", adjustmentPercent < 0 ? "text-emerald-700" : "text-rose-600")}>
                    {adjustmentPercent < 0 ? "Descuento" : "Recargo"} {adjustmentPercent > 0 ? "+" : ""}{adjustmentPercent}%: {formatCurrency(adjustmentCents)}
                    <span className="ml-1 text-zinc-500">(base {formatCurrency(remaining)})</span>
                  </p>
                )}
                {method === "cash" && amount > finalCents && (
                  <p className="text-xs font-semibold text-emerald-700">
                    Vuelto: {formatCurrency(amount - finalCents)}
                  </p>
                )}
              </div>

              {/* Propina (cash, card_manual, transfer) */}
              {(method === "cash" || method === "card_manual" || method === "transfer") && (
                <div className="grid gap-1.5">
                  <Label>Propina (opcional)</Label>
                  <Input
                    type="number"
                    value={tip / 100}
                    onChange={(e) =>
                      setTip(
                        Math.max(0, Math.round(Number(e.target.value) * 100)),
                      )
                    }
                    inputMode="decimal"
                  />
                </div>
              )}

              {/* Card */}
              {method === "card_manual" && (
                <>
                  <div className="grid gap-1.5">
                    <Label>Últimos 4 dígitos</Label>
                    <Input
                      value={lastFour}
                      onChange={(e) =>
                        setLastFour(
                          e.target.value.replace(/\D/g, "").slice(0, 4),
                        )
                      }
                      placeholder="1234"
                      maxLength={4}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Marca</Label>
                    <Select
                      value={cardBrand}
                      onValueChange={(v) =>
                        v &&
                        setCardBrand(
                          v as "visa" | "mastercard" | "amex" | "otro",
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="visa">Visa</SelectItem>
                        <SelectItem value="mastercard">MasterCard</SelectItem>
                        <SelectItem value="amex">Amex</SelectItem>
                        <SelectItem value="otro">Otra</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Notas */}
              {(method === "other" || method === "card_manual" || method === "transfer") && (
                <div className="grid gap-1.5">
                  <Label>
                    Notas
                    {(method === "other" || method === "transfer") && (
                      <span className="ml-1 text-rose-600">*</span>
                    )}
                  </Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder={
                      method === "transfer"
                        ? "Alias o referencia de la transferencia…"
                        : method === "other"
                          ? "Cheque #1234, cortesía…"
                          : "Opcional"
                    }
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer fijo */}
        {method && (
          <SheetFooter className="border-t border-zinc-100 pt-4">
            <Button variant="ghost" onClick={onClose} className="flex-shrink-0">
              Cancelar
            </Button>
            <Button
              className="flex-1"
              disabled={
                amount <= 0 ||
                ((method === "other" || method === "transfer") && notes.trim() === "") ||
                (method === "card_manual" &&
                  lastFour !== "" &&
                  lastFour.length !== 4)
              }
              onClick={handleConfirm}
            >
              Confirmar {formatCurrency(amount)}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Anular cobro ──────────────────────────────────────────────

function AnularCobroSection({
  orderId,
  slug,
  onDone,
}: {
  orderId: string;
  slug: string;
  onDone: () => void;
}) {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
      >
        <Trash2 className="size-3.5" />
        Anular cobro
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular cobro</DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-sm text-zinc-600">
            Los pagos cobrados se marcan como reembolsados (auditoría) y la
            mesa vuelve a esperando cuenta.
          </p>
          <div className="grid gap-1.5">
            <Label>
              Motivo<span className="ml-1 text-rose-600">*</span>
            </Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              placeholder="Ej: cliente reclamó, pago doble, error de carga…"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Volver
            </Button>
            <Button
              variant="destructive"
              disabled={motivo.trim() === ""}
              onClick={() =>
                startTransition(async () => {
                  const r = await anularCobro(orderId, motivo, slug);
                  if (!r.ok) toast.error(r.error);
                  else {
                    toast.success("Cobro anulado");
                    setOpen(false);
                    onDone();
                  }
                })
              }
            >
              Anular cobro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

