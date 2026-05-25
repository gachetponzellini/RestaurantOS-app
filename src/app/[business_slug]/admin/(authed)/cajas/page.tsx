import { notFound, redirect } from "next/navigation";

import { PageHeader, PageShell } from "@/components/admin/shell/page-shell";
import { canManageBusiness, ensureAdminAccess } from "@/lib/admin/context";
import { getAllCajasForBusiness } from "@/lib/caja/queries";
import { getBusiness } from "@/lib/tenant";

import { CajasClient } from "./cajas-client";

export const dynamic = "force-dynamic";

export default async function CajasPage({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  const ctx = await ensureAdminAccess(business.id, business_slug);
  // Solo admin: el encargado opera desde /admin/local, no configura cajas.
  if (!canManageBusiness(ctx)) {
    redirect(`/${business_slug}/admin/local?tab=caja`);
  }

  const cajas = await getAllCajasForBusiness(business.id);

  return (
    <PageShell width="default">
      <PageHeader
        eyebrow="Configuración"
        title="Cajas"
        description="Las cajas físicas del local donde se cobra. Cada caja está siempre activa — no requiere abrir ni cerrar."
      />
      <CajasClient slug={business_slug} cajas={cajas} />
    </PageShell>
  );
}
