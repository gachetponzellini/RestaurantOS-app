"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { AdminOrder } from "@/lib/admin/orders-query";
import {
  CONDICION_IVA_LABEL,
  condicionesValidasPara,
  condicionIvaDefault,
} from "@/lib/afip/condicion-iva";
import { emitInvoice } from "@/lib/afip/emit-invoice";
import type { CondicionIvaReceptor, TipoComprobante } from "@/lib/afip/types";
import { iniciarCobro, registrarPago } from "@/lib/billing/cobro-actions";
import type { Caja, PaymentMethod } from "@/lib/caja/types";
import { formatCurrency } from "@/lib/currency";

/** Métodos de mostrador (fase 1). MP link/QR quedan fuera (Non-Goal spec 054). */
const METODOS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Efectivo" },
  { value: "card_manual", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
];

/**
 * Spec 054 — «Cobrar / Facturar» un pedido para llevar/delivery SIN mesa desde
 * el board. Orquesta los actions ya existentes (que soportan orden sin
 * `table_id`): `registrarPago({ splitId: null })` → `closeOrderIfFullyPaid`
 * (cierra la orden) → `emitInvoice` (order-scoped). Un solo pago por el total,
 * sin propina/splits. Factura B por defecto; A con CUIT + condición IVA (spec
 * 053). La UI de cobro de mesa (`cobrar-client.tsx`) está acoplada a `table_id`
 * → acá se usa un sheet mínimo propio, no se reusa.
 */
export function CobrarPedidoSheet({
  order,
  slug,
  open,
  onClose,
  onDone,
}: {
  order: AdminOrder;
  slug: string;
  open: boolean;
  onClose: () => void;
  /** Corre tras cobrar con éxito (ej: cerrar el detalle del pedido). */
  onDone?: () => void;
}) {
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [cajaId, setCajaId] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [conFacturaA, setConFacturaA] = useState(false);
  const [cuit, setCuit] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [condicionIva, setCondicionIva] = useState<CondicionIvaReceptor>(
    condicionIvaDefault("factura_a"),
  );

  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    iniciarCobro(order.id, slug).then((r) => {
      if (r.ok) {
        setCajas(r.data.cajas);
        setCajaId(r.data.cajas[0]?.id ?? "");
      } else {
        setLoadError(r.error);
      }
      setLoading(false);
    });
  }, [open, order.id, slug]);

  const tipoComprobante: TipoComprobante = conFacturaA
    ? "factura_a"
    : "factura_b";

  function submit() {
    if (!cajaId) {
      toast.error("Elegí una caja para registrar el pago.");
      return;
    }
    if (conFacturaA && cuit.trim().replace(/\D/g, "").length !== 11) {
      toast.error("Ingresá el CUIT del receptor (11 dígitos).");
      return;
    }
    startTransition(async () => {
      // 1) Registrar el pago por el total (sin split, sin propina). Cierra la
      //    orden vía closeOrderIfFullyPaid (que saltea la mesa si no hay).
      const pago = await registrarPago({
        orderId: order.id,
        splitId: null,
        method,
        amount_cents: order.total_cents,
        tip_cents: 0,
        caja_id: cajaId,
        slug,
        requestId: crypto.randomUUID(),
      });
      if (!pago.ok) {
        toast.error(pago.error);
        return;
      }
      // 2) Emitir la factura (best-effort): si falla, el pago ya quedó
      //    registrado y se puede re-facturar desde Facturación.
      const factura = await emitInvoice({
        orderId: order.id,
        slug,
        tipoComprobante,
        ...(conFacturaA
          ? {
              cuitReceptor: cuit.trim().replace(/\D/g, ""),
              razonSocialReceptor: razonSocial.trim() || undefined,
              condicionIvaReceptor: condicionIva,
            }
          : {}),
      });
      if (!factura.ok) {
        toast.warning(
          `Pago registrado. La factura no se emitió: ${factura.error}. Reintentá desde Facturación.`,
        );
      } else {
        toast.success(`Pedido #${order.order_number} cobrado y facturado.`);
      }
      onDone?.();
      onClose();
    });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        showCloseButton
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetTitle className="border-border/60 border-b px-5 py-4 text-lg font-bold">
          Cobrar pedido #{order.order_number}
        </SheetTitle>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
            </div>
          ) : loadError ? (
            <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800 ring-1 ring-rose-200">
              {loadError}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Total */}
              <div className="flex items-baseline justify-between rounded-xl bg-muted/50 px-4 py-3">
                <span className="text-sm font-medium text-muted-foreground">
                  Total a cobrar
                </span>
                <span className="text-2xl font-extrabold tabular-nums">
                  {formatCurrency(order.total_cents)}
                </span>
              </div>

              {/* Caja (sólo si hay más de una) */}
              {cajas.length > 1 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                    Caja
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {cajas.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => setCajaId(c.id)}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                          cajaId === c.id
                            ? "bg-zinc-900 text-white"
                            : "bg-white text-zinc-700 ring-1 ring-zinc-200"
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Método de pago */}
              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                  Método de pago
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {METODOS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => setMethod(m.value)}
                      className={`rounded-xl py-2.5 text-sm font-semibold transition ${
                        method === m.value
                          ? "bg-zinc-900 text-white"
                          : "bg-white text-zinc-700 ring-1 ring-zinc-200"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comprobante */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                  <input
                    type="checkbox"
                    checked={conFacturaA}
                    onChange={(e) => setConFacturaA(e.target.checked)}
                    className="size-4 rounded border-zinc-300"
                  />
                  Factura A (empresa con CUIT)
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {conFacturaA
                    ? "Se emite Factura A al CUIT indicado."
                    : "Por defecto: Factura B (consumidor final)."}
                </p>
                {conFacturaA && (
                  <div className="mt-3 space-y-2.5">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={cuit}
                      onChange={(e) => setCuit(e.target.value)}
                      placeholder="CUIT (11 dígitos)"
                      className="block h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                    />
                    <input
                      type="text"
                      value={razonSocial}
                      onChange={(e) => setRazonSocial(e.target.value)}
                      placeholder="Razón social (opcional)"
                      className="block h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                    />
                    <div>
                      <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                        Condición IVA del receptor
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {condicionesValidasPara("factura_a").map((cond) => (
                          <button
                            key={cond}
                            onClick={() => setCondicionIva(cond)}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                              condicionIva === cond
                                ? "bg-zinc-900 text-white"
                                : "bg-white text-zinc-700 ring-1 ring-zinc-200"
                            }`}
                          >
                            {CONDICION_IVA_LABEL[cond]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="border-border/60 border-t px-5 py-4">
          <Button
            size="lg"
            className="w-full font-semibold"
            disabled={loading || !!loadError || pending || !cajaId}
            onClick={submit}
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Receipt className="size-4" />
            )}
            Cobrar {formatCurrency(order.total_cents)}
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  );
}
