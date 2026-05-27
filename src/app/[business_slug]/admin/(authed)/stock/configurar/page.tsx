import { notFound } from "next/navigation";

import { PageHeader, PageShell } from "@/components/admin/shell/page-shell";
import { ensureAdminAccess, canManageBusiness } from "@/lib/admin/context";
import { getAllProductsForConfig } from "@/lib/stock/queries";
import { getBusiness } from "@/lib/tenant";

import { StockConfigClient } from "./stock-config-client";

export const dynamic = "force-dynamic";

export default async function StockConfigPage({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  const ctx = await ensureAdminAccess(business.id, business_slug);
  void canManageBusiness(ctx);

  const products = await getAllProductsForConfig(business.id);

  return (
    <PageShell width="default">
      <PageHeader
        eyebrow="Stock"
        title="Configurar productos"
        description="Activá el tracking de stock para los productos que querés controlar. Al activar, ingresá el stock inicial y el mínimo."
        back={{ href: `/${business_slug}/admin/stock`, label: "Stock" }}
      />
      <StockConfigClient products={products} slug={business_slug} />
    </PageShell>
  );
}
