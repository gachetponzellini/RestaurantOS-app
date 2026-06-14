"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emitInvoice } from "@/lib/afip/emit-invoice";
import { crearPedidoFlash } from "@/lib/billing/pedido-flash";

type Props = {
  slug: string;
};

/**
 * Pedido flash (spec 09): factura un evento por monto total sin desglose. Crea
 * una orden de un único renglón (concepto libre) y emite la factura por ese
 * total, sin dar de alta el producto en la carta.
 */
export function PedidoFlashDialog({ slug }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setConcepto("");
    setMonto("");
  };

  const handleSubmit = () => {
    const conceptoTrim = concepto.trim();
    const montoNum = Number(monto.replace(",", "."));
    if (!conceptoTrim) {
      toast.error("Ingresá un concepto para el pedido flash.");
      return;
    }
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      toast.error("Ingresá un monto mayor a 0.");
      return;
    }
    const montoCents = Math.round(montoNum * 100);

    startTransition(async () => {
      const created = await crearPedidoFlash({
        slug,
        concepto: conceptoTrim,
        montoCents,
      });
      if (!created.ok) {
        toast.error(created.error);
        return;
      }

      const invoiced = await emitInvoice({
        orderId: created.data.orderId,
        slug,
      });
      if (!invoiced.ok) {
        toast.error(
          `Pedido flash creado, pero la factura falló: ${invoiced.error}`,
        );
        router.refresh();
        return;
      }

      toast.success("Pedido flash facturado.");
      reset();
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Zap className="size-3.5" />
            Pedido flash
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pedido flash</DialogTitle>
          <DialogDescription>
            Facturá un evento por monto total, sin desglose de productos. Se crea
            una orden de un solo renglón y se emite la factura.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="flash-concepto">Concepto</Label>
            <Input
              id="flash-concepto"
              placeholder="Ej: Lunch torneo Banco Macro"
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="flash-monto">Monto total (ARS)</Label>
            <Input
              id="flash-monto"
              inputMode="decimal"
              placeholder="250000"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={pending} />}>
            Cancelar
          </DialogClose>
          <Button onClick={handleSubmit} disabled={pending}>
            {pending ? "Facturando…" : "Crear y facturar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
