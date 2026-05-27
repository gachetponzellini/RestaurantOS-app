import Link from "next/link";
import { notFound } from "next/navigation";
import { Package, Settings } from "lucide-react";

import { PageHeader, PageShell } from "@/components/admin/shell/page-shell";
import { ensureAdminAccess } from "@/lib/admin/context";
import { getStockOverview } from "@/lib/stock/queries";
import { getBusiness } from "@/lib/tenant";

import { StockGrid } from "./stock-grid";

export const dynamic = "force-dynamic";

export default async function StockPage({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  await ensureAdminAccess(business.id, business_slug);

  const items = await getStockOverview(business.id);

  return (
    <PageShell width="default">
      <PageHeader
        eyebrow="Inventario"
        title="Stock"
        description="Seguimiento de stock de bebidas y vinos. El sistema descuenta automáticamente al vender."
        action={
          <Link
            href={`/${business_slug}/admin/stock/configurar`}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            <Settings className="size-4" />
            Configurar productos
          </Link>
        }
      />
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 py-16">
          <Package className="size-10 text-zinc-400" strokeWidth={1.5} />
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-700">
              No hay productos con stock trackeado
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Activá el tracking desde{" "}
              <Link
                href={`/${business_slug}/admin/stock/configurar`}
                className="font-medium underline underline-offset-2"
              >
                Configurar productos
              </Link>
            </p>
          </div>
        </div>
      ) : (
        <StockGrid items={items} slug={business_slug} />
      )}
    </PageShell>
  );
}
