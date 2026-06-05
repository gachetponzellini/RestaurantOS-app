"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, Link2, Pencil, Plus } from "lucide-react";
import { formatCurrency } from "@/lib/currency";
import type { SupplierWithStats } from "@/lib/proveedores/types";
import type { SupplierInvoice, SupplierIngredientLink } from "@/lib/proveedores/types";
import { getSupplierInvoices, getSupplierIngredients } from "@/lib/proveedores/actions-client";
import { Button } from "@/components/ui/button";
import { SupplierDialog } from "./supplier-dialog";
import { InvoiceDialog } from "./invoice-dialog";
import { IngredientLinkDialog } from "./ingredient-link-dialog";

type Props = {
  slug: string;
  businessId: string;
  supplier: SupplierWithStats;
  ingredientOptions: { id: string; name: string; unit: string }[];
  onBack: () => void;
};

export function SupplierDetail({
  slug,
  businessId,
  supplier,
  ingredientOptions,
  onBack,
}: Props) {
  const router = useRouter();
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [ingredients, setIngredients] = useState<SupplierIngredientLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [invs, ings] = await Promise.all([
        getSupplierInvoices(supplier.id, businessId),
        getSupplierIngredients(supplier.id, businessId),
      ]);
      if (!cancelled) {
        setInvoices(invs);
        setIngredients(ings);
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supplier.id, businessId]);

  const refreshData = () => {
    router.refresh();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-zinc-900">{supplier.name}</h2>
          <p className="text-sm text-zinc-500">
            {[supplier.cuit, supplier.contact, supplier.phone, supplier.email]
              .filter(Boolean)
              .join(" · ") || "Sin datos de contacto"}
          </p>
        </div>
        <SupplierDialog
          slug={slug}
          supplier={supplier}
          trigger={
            <Button variant="outline" size="sm">
              <Pencil className="size-3.5 mr-1.5" />
              Editar
            </Button>
          }
        />
      </div>

      {supplier.notes && (
        <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-600">
          {supplier.notes}
        </p>
      )}

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">Total gastado</p>
          <p className="text-lg font-bold tabular-nums text-zinc-900">
            {formatCurrency(supplier.totalSpentCents)}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">Facturas</p>
          <p className="text-lg font-bold tabular-nums text-zinc-900">
            {supplier.invoiceCount}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">Última factura</p>
          <p className="text-lg font-bold text-zinc-900">
            {supplier.lastInvoiceDate ?? "—"}
          </p>
        </div>
      </div>

      {/* Invoices */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
            <FileText className="size-4 text-zinc-500" />
            Facturas de compra
          </h3>
          <InvoiceDialog
            slug={slug}
            supplierId={supplier.id}
            businessId={businessId}
            onSuccess={refreshData}
            trigger={
              <Button variant="outline" size="sm">
                <Plus className="size-3.5 mr-1.5" />
                Cargar factura
              </Button>
            }
          />
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-zinc-400">Cargando…</p>
        ) : invoices.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-400">
            Sin facturas cargadas.
          </p>
        ) : (
          <div className="divide-y rounded-xl border bg-white">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 p-3">
                {inv.photoSignedUrl ? (
                  <a
                    href={inv.photoSignedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block size-12 shrink-0 overflow-hidden rounded-lg border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={inv.photoSignedUrl}
                      alt="Foto factura"
                      className="size-full object-cover"
                    />
                  </a>
                ) : (
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border bg-zinc-50">
                    <FileText className="size-5 text-zinc-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900">
                    {inv.invoiceNumber || "Sin número"}
                  </p>
                  <p className="text-xs text-zinc-500">{inv.invoiceDate}</p>
                </div>
                <p className="text-sm font-semibold tabular-nums text-zinc-900">
                  {formatCurrency(inv.totalCents)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Linked ingredients */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
            <Link2 className="size-4 text-zinc-500" />
            Insumos que provee
          </h3>
          <IngredientLinkDialog
            slug={slug}
            supplierId={supplier.id}
            businessId={businessId}
            ingredientOptions={ingredientOptions}
            currentLinks={ingredients}
            onSuccess={refreshData}
          />
        </div>

        {loading ? (
          <p className="py-4 text-center text-sm text-zinc-400">Cargando…</p>
        ) : ingredients.length === 0 ? (
          <p className="py-4 text-center text-sm text-zinc-400">
            Sin insumos vinculados.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ingredients.map((link) => (
              <span
                key={link.ingredientId}
                className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700"
              >
                {link.ingredientName} ({link.ingredientUnit})
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
