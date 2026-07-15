import { notFound } from "next/navigation";

import { Fingerprint, MonitorDown, Printer } from "lucide-react";

import { ClockOriginsForm } from "@/components/admin/settings/clock-origins-form";
import { PrintAgentCard } from "@/components/admin/settings/print-agent-card";
import { SettingsSection } from "@/components/admin/settings/settings-section";
import {
  StationPrintersForm,
  type StationPrinterRow,
} from "@/components/admin/settings/station-printers-form";
import { listClockOrigins } from "@/lib/rrhh/clock-origin-actions";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

// Ajustes › Operación del local: impresoras por sector (comanderas) y fichaje
// restringido a las computadoras del local. El gate vive en el layout.
export default async function ConfiguracionLocalPage({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  const service = createSupabaseServiceClient();
  const [clockOrigins, { data: stations }, { data: bizFlag }, { data: agentStatus }] =
    await Promise.all([
      listClockOrigins(business.id),
      service
        .from("stations")
        .select("id, name, is_active, printer_ip, printer_port, printer_enabled")
        .eq("business_id", business.id)
        .order("sort_order"),
      service
        .from("businesses")
        .select("print_agent_key_set")
        .eq("id", business.id)
        .maybeSingle(),
      service
        .from("print_agent_status")
        .select("last_seen_at")
        .eq("business_id", business.id)
        .maybeSingle(),
    ]);

  const printAgentKeySet = Boolean(
    (bizFlag as { print_agent_key_set?: boolean } | null)?.print_agent_key_set,
  );
  const printAgentLastSeenAt =
    (agentStatus as { last_seen_at?: string } | null)?.last_seen_at ?? null;

  return (
    <>
      <SettingsSection
        icon={<Printer className="size-5" />}
        title="Comanderas"
        description="Asigná a cada sector la IP de su impresora térmica en la red del local. Dejá la IP vacía para un sector sin comandera (no se imprime). Puerto por defecto 9100."
      >
        <StationPrintersForm
          slug={business_slug}
          stations={(stations ?? []) as StationPrinterRow[]}
        />
      </SettingsSection>

      <SettingsSection
        icon={<MonitorDown className="size-5" />}
        title="Agente de impresión"
        description="Descargá el agente ya configurado para este negocio e instalalo en UNA PC del local (la que quede siempre prendida). Hace de puente entre el sistema y las comanderas de la red."
      >
        <PrintAgentCard
          slug={business_slug}
          keySet={printAgentKeySet}
          lastSeenAt={printAgentLastSeenAt}
        />
      </SettingsSection>

      <SettingsSection
        icon={<Fingerprint className="size-5" />}
        title="Fichaje desde el local"
        description="Restringí el fichaje a las computadoras del local. Agregá el rango de IP de la red interna (CIDR); sin orígenes configurados se puede fichar desde cualquier dispositivo."
      >
        <ClockOriginsForm slug={business_slug} origins={clockOrigins} />
      </SettingsSection>
    </>
  );
}

export const dynamic = "force-dynamic";
