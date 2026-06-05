"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader } from "@/components/admin/catalog/image-uploader";
import { createSupplierInvoice } from "@/lib/proveedores/actions";
import { SupplierInvoiceInput } from "@/lib/proveedores/schema";

type Props = {
  slug: string;
  supplierId: string;
  businessId: string;
  onSuccess?: () => void;
  trigger: React.ReactElement;
};

export function InvoiceDialog({
  slug,
  supplierId,
  businessId,
  onSuccess,
  trigger,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photoPath, setPhotoPath] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const form = useForm<SupplierInvoiceInput>({
    resolver: zodResolver(SupplierInvoiceInput),
    defaultValues: {
      supplier_id: supplierId,
      invoice_number: "",
      invoice_date: today,
      total_cents: 0,
      photo_url: null,
      notes: "",
    },
  });

  const onSubmit = async (values: SupplierInvoiceInput) => {
    setSubmitting(true);
    try {
      const result = await createSupplierInvoice(slug, {
        ...values,
        photo_url: photoPath,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Factura cargada.");
      setOpen(false);
      setPhotoPath(null);
      form.reset();
      router.refresh();
      onSuccess?.();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cargar factura de compra</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="invoice_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número de factura</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="FcA 0001-00012345"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="invoice_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fecha *</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="total_cents"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Total ($) *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      placeholder="45000"
                      value={field.value ? field.value / 100 : ""}
                      onChange={(e) => {
                        const pesos = parseFloat(e.target.value) || 0;
                        field.onChange(Math.round(pesos * 100));
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                  <p className="text-xs text-zinc-500">Ingresá el monto en pesos.</p>
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium">Foto de la factura</label>
              <ImageUploader
                businessId={businessId}
                value={photoPath}
                onChange={(url) => setPhotoPath(url)}
                bucket="supplier-invoices"
                returnPath
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observaciones…"
                      rows={2}
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Guardando…" : "Cargar factura"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
