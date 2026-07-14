import { notFound, redirect } from "next/navigation";

import { SettingsNav } from "@/components/admin/settings/settings-nav";
import { PageHeader, PageShell } from "@/components/admin/shell/page-shell";
import { canManageBusiness, ensureAdminAccess } from "@/lib/admin/context";
import { getBusiness } from "@/lib/tenant";

// Shell compartido de Ajustes: gatea una vez (cubre todas las sub-rutas) y
// mantiene el header + la sub-navegación fijos mientras cambia la sección.
// Cada page hija sólo renderiza sus tarjetas de sección.
export default async function ConfiguracionLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  const ctx = await ensureAdminAccess(business.id, business_slug);
  if (!canManageBusiness(ctx)) redirect(`/${business_slug}/admin`);

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Ajustes"
        title="Configuración"
        description={`Todo lo de tu negocio, organizado por secciones. URL pública: /${business.slug}`}
      />
      <SettingsNav slug={business_slug} />
      {children}
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
