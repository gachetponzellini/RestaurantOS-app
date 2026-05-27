"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ingresarStock, ajustarStock } from "@/lib/stock/actions";

export function StockMovementSheet({
  open,
  onOpenChange,
  productId,
  productName,
  mode,
  slug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  mode: "ingreso" | "ajuste";
  slug: string;
}) {
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = parseInt(qty, 10);
    if (isNaN(parsed) || parsed === 0) {
      toast.error("Ingresá una cantidad válida.");
      return;
    }
    if (mode === "ajuste" && !reason.trim()) {
      toast.error("El motivo es obligatorio para ajustes.");
      return;
    }

    startTransition(async () => {
      const result =
        mode === "ingreso"
          ? await ingresarStock(productId, parsed, slug, reason || undefined)
          : await ajustarStock(productId, parsed, reason, slug);

      if (result.ok) {
        toast.success(
          mode === "ingreso"
            ? `+${parsed} ingresados a ${productName}`
            : `Ajuste de ${parsed > 0 ? "+" : ""}${parsed} en ${productName}`,
        );
        onOpenChange(false);
        setQty("");
        setReason("");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {mode === "ingreso" ? "Ingresar stock" : "Ajustar stock"}
          </SheetTitle>
          <SheetDescription>{productName}</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="qty">
              {mode === "ingreso"
                ? "Cantidad a ingresar"
                : "Cantidad (negativa = merma)"}
            </Label>
            <Input
              id="qty"
              type="number"
              min={mode === "ingreso" ? 1 : undefined}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={mode === "ingreso" ? "Ej: 24" : "Ej: -2"}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="reason">
              {mode === "ingreso" ? "Nota (opcional)" : "Motivo (obligatorio)"}
            </Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                mode === "ingreso"
                  ? "Ej: Factura #1234"
                  : "Ej: Botella rota"
              }
            />
          </div>
          <Button type="submit" disabled={pending} className="mt-2">
            {mode === "ingreso" ? "Ingresar" : "Ajustar"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
