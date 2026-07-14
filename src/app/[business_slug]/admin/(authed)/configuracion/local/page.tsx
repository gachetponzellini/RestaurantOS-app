import { notFound } from "next/navigation";

import { Fingerprint, Printer } from "lucide-react";

import { ClockOriginsForm } from "@/components/admin/settings/clock-origins-form";
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
  const [clockOrigins, { data: stations }] = await Promise.all([
    listClockOrigins(business.id),
    service
      .from("stations")
      .select("id, name, is_active, printer_ip, printer_port, printer_enabled")
      .eq("business_id", business.id)
      .order("sort_order"),
  ]);

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
