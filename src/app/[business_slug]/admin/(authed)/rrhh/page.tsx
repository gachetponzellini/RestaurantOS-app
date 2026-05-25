import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import {
  PageHeader,
  PageShell,
} from "@/components/admin/shell/page-shell";
import { RrhhShell, type RrhhTab } from "@/components/admin/rrhh/rrhh-shell";
import { AsistenciaTab } from "@/components/admin/rrhh/asistencia-tab";
import { EquipoTab } from "@/components/admin/rrhh/equipo-tab";
import { MesEnCursoTab } from "@/components/admin/rrhh/mes-tab";
import {
  canManageBusiness,
  ensureAdminAccess,
} from "@/lib/admin/context";
import { listBusinessMembers } from "@/lib/admin/members-query";
import {
  getClockHistory,
  getMonthlyOverview,
  getTodaySummary,
} from "@/lib/rrhh/clock-queries";
import { getBusiness } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function RrhhPage({
  params,
  searchParams,
}: {
  params: Promise<{ business_slug: string }>;
  searchParams: Promise<{ tab?: string; disabled?: string }>;
}) {
  const { business_slug } = await params;
  const { tab, disabled } = await searchParams;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  const ctx = await ensureAdminAccess(business.id, business_slug);
  if (!canManageBusiness(ctx) && ctx.role !== "encargado") {
    redirect(`/${business_slug}/admin`);
  }

  const activeTab: RrhhTab =
    tab === "equipo" || tab === "asistencia" ? tab : "mes";

  const [today, history, members, monthly] = await Promise.all([
    getTodaySummary(business.id),
    getClockHistory(business.id, { limit: 50 }),
    listBusinessMembers(business.id, { includeDisabled: disabled === "1" }),
    getMonthlyOverview(business.id, getMonthStart()),
  ]);

  return (
    <PageShell width="default">
      <PageHeader
        eyebrow="Gestión"
        title="RRHH"
        description="Fichadas, equipo y horas trabajadas."
      />

      <Suspense>
        <RrhhShell activeTab={activeTab}>
          {activeTab === "mes" && <MesEnCursoTab overview={monthly} />}
          {activeTab === "asistencia" && (
            <AsistenciaTab today={today} history={history} />
          )}
          {activeTab === "equipo" && (
            <EquipoTab
              slug={business_slug}
              businessName={business.name}
              members={members}
              currentUserId={ctx.user.id}
              includeDisabled={disabled === "1"}
            />
          )}
        </RrhhShell>
      </Suspense>
    </PageShell>
  );
}

function getMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}
