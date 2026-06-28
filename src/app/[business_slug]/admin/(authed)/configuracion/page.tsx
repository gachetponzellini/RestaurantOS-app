import { notFound, redirect } from "next/navigation";

import { Bell, Clock, CreditCard, Fingerprint, Mail, MessageCircle, Printer, Receipt, Smartphone } from "lucide-react";

import { AfipConfigForm } from "@/components/admin/settings/afip-config-form";
import { BusinessHoursForm } from "@/components/admin/settings/business-hours-form";
import { ClockOriginsForm } from "@/components/admin/settings/clock-origins-form";
import { BusinessSettingsForm } from "@/components/admin/settings/business-settings-form";
import { DeliveryTemplatesForm } from "@/components/admin/settings/delivery-templates-form";
import { NotificationPreferencesForm } from "@/components/admin/settings/notification-preferences-form";
import { PaymentMethodsConfig } from "@/components/admin/settings/payment-methods-config";
import { SettingsSection } from "@/components/admin/settings/settings-section";
import { ShiftSummaryForm } from "@/components/admin/settings/shift-summary-form";
import {
  StationPrintersForm,
  type StationPrinterRow,
} from "@/components/admin/settings/station-printers-form";
import { WhatsappConfigForm } from "@/components/admin/settings/whatsapp-config-form";
import { PageHeader, PageShell } from "@/components/admin/shell/page-shell";
import {
  canManageBusiness,
  ensureAdminAccess,
} from "@/lib/admin/context";
import { BRANDING_DEFAULTS } from "@/lib/branding/tokens";
import { getAllPaymentMethodConfigs } from "@/lib/caja/queries";
import { currentDayOfWeek } from "@/lib/day-of-week";
import { getMenu } from "@/lib/menu";
import { listClockOrigins } from "@/lib/rrhh/clock-origin-actions";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness, getBusinessSettings } from "@/lib/tenant";

export default async function ConfiguracionPage({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  const ctx = await ensureAdminAccess(business.id, business_slug);
  if (!canManageBusiness(ctx)) redirect(`/${business_slug}/admin`);

  const settings = getBusinessSettings(business);
  const service = createSupabaseServiceClient();
  const [menu, methodConfigs, { data: businessHours }, clockOrigins, { data: stations }] =
    await Promise.all([
      getMenu(business.id, currentDayOfWeek(business.timezone)),
      getAllPaymentMethodConfigs(business.id),
      service
        .from("business_hours")
        .select("day_of_week, opens_at, closes_at")
        .eq("business_id", business.id)
        .order("day_of_week")
        .order("opens_at"),
      listClockOrigins(business.id),
      service
        .from("stations")
        .select("id, name, is_active, printer_ip, printer_port, printer_enabled")
        .eq("business_id", business.id)
        .order("sort_order"),
    ]);
  const sampleProducts = menu.categories
    .flatMap((c) => c.products)
    .slice(0, 3)
    .map((p) => ({
      id: p.id,
      name: p.name,
      price_cents: p.price_cents,
      image_url: p.image_url ?? null,
    }));

  const hex = (v: string | undefined, fallback: string) =>
    (v ?? fallback).toUpperCase();
  const initial = {
    slug: business.slug,
    name: business.name,
    phone: business.phone ?? "",
    email: business.email ?? "",
    address: business.address ?? "",
    timezone: business.timezone,
    logo_url: business.logo_url ?? null,
    cover_image_url: business.cover_image_url ?? null,
    primary_color: hex(settings.primary_color, BRANDING_DEFAULTS.primary_color),
    primary_foreground: hex(
      settings.primary_foreground,
      BRANDING_DEFAULTS.primary_foreground,
    ),
    // Extended palette
    secondary_color: hex(
      settings.secondary_color,
      BRANDING_DEFAULTS.secondary_color,
    ),
    secondary_foreground: hex(
      settings.secondary_foreground,
      BRANDING_DEFAULTS.secondary_foreground,
    ),
    accent_color: hex(settings.accent_color, BRANDING_DEFAULTS.accent_color),
    accent_foreground: hex(
      settings.accent_foreground,
      BRANDING_DEFAULTS.accent_foreground,
    ),
    background_color: hex(
      settings.background_color,
      BRANDING_DEFAULTS.background_color,
    ),
    background_color_dark: hex(
      settings.background_color_dark,
      BRANDING_DEFAULTS.background_color_dark,
    ),
    surface_color: hex(settings.surface_color, BRANDING_DEFAULTS.surface_color),
    muted_color: hex(settings.muted_color, BRANDING_DEFAULTS.muted_color),
    border_color: hex(settings.border_color, BRANDING_DEFAULTS.border_color),
    success_color: hex(settings.success_color, BRANDING_DEFAULTS.success_color),
    warning_color: hex(settings.warning_color, BRANDING_DEFAULTS.warning_color),
    destructive_color: hex(
      settings.destructive_color,
      BRANDING_DEFAULTS.destructive_color,
    ),
    // Typography
    font_heading: settings.font_heading ?? BRANDING_DEFAULTS.font_heading,
    font_body: settings.font_body ?? BRANDING_DEFAULTS.font_body,
    // Shape
    radius_scale: settings.radius_scale ?? BRANDING_DEFAULTS.radius_scale,
    shadow_scale: settings.shadow_scale ?? BRANDING_DEFAULTS.shadow_scale,
    density: settings.density ?? BRANDING_DEFAULTS.density,
    // Iconography
    icon_stroke_width:
      settings.icon_stroke_width ?? BRANDING_DEFAULTS.icon_stroke_width,
    icon_style: settings.icon_style ?? BRANDING_DEFAULTS.icon_style,
    // Mode
    default_mode: settings.default_mode ?? BRANDING_DEFAULTS.default_mode,
    // Logo variants
    logo_mark_url: settings.logo_mark_url ?? null,
    logo_mono_url: settings.logo_mono_url ?? null,
    favicon_url: settings.favicon_url ?? null,
    delivery_fee_cents: Number(business.delivery_fee_cents ?? 0) / 100,
    min_order_cents: Number(business.min_order_cents ?? 0) / 100,
    estimated_delivery_minutes: business.estimated_delivery_minutes,
    mp_access_token: business.mp_access_token ?? "",
    mp_public_key: business.mp_public_key ?? "",
    mp_webhook_secret: business.mp_webhook_secret ?? "",
    mp_accepts_payments: business.mp_accepts_payments,
  };

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Negocio"
        title="Configuración"
        description={`Datos de contacto, marca, envío y pagos. URL pública: /${business.slug}`}
      />
      <BusinessSettingsForm
        slug={business_slug}
        businessId={business.id}
        initial={initial}
        sampleProducts={sampleProducts}
      />

      <div className="mt-8">
        <SettingsSection
          icon={<Clock className="size-5" />}
          title="Horarios de atención"
          description="Configurá en qué horarios el local acepta pedidos. Los días sin franjas aparecen como cerrados."
        >
          <BusinessHoursForm
            slug={business_slug}
            initial={businessHours ?? []}
          />
        </SettingsSection>
      </div>

      <div className="mt-8">
        <SettingsSection
          icon={<Fingerprint className="size-5" />}
          title="Fichaje desde el local"
          description="Restringí el fichaje a las computadoras del local. Agregá el rango de IP de la red interna (CIDR); sin orígenes configurados se puede fichar desde cualquier dispositivo."
        >
          <ClockOriginsForm slug={business_slug} origins={clockOrigins} />
        </SettingsSection>
      </div>

      <div className="mt-8">
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
      </div>

      <div className="mt-8">
        <SettingsSection
          icon={<CreditCard className="size-5" />}
          title="Métodos de pago"
          description="Configurá recargos o descuentos por método de pago. Se aplican automáticamente al cobrar."
        >
          <PaymentMethodsConfig slug={business_slug} configs={methodConfigs} />
        </SettingsSection>
      </div>

      <div className="mt-8">
        <SettingsSection
          icon={<Receipt className="size-5" />}
          title="Facturación AFIP"
          description="Configurá la emisión de comprobantes electrónicos AFIP. Necesitás CUIT y punto de venta."
        >
          <AfipConfigForm
            slug={business_slug}
            initial={{
              cuit: (business as Record<string, unknown>).afip_cuit as string ?? "",
              puntoVenta: (business as Record<string, unknown>).afip_punto_venta as number ?? 0,
              provider: ((business as Record<string, unknown>).afip_provider as "tusfacturas" | "afipsdk" | "direct") ?? "tusfacturas",
              defaultTipo: ((business as Record<string, unknown>).afip_default_tipo as "factura_a" | "factura_b" | "nota_credito_a" | "nota_credito_b") ?? "factura_b",
              mode: ((business as Record<string, unknown>).afip_mode as "sandbox" | "produccion") ?? "sandbox",
              enabled: Boolean((business as Record<string, unknown>).afip_enabled),
              // Sólo flags: el valor del secreto NUNCA se manda al cliente.
              hasApiToken: Boolean((business as Record<string, unknown>).afip_provider_api_token),
              hasApiKey: Boolean((business as Record<string, unknown>).afip_provider_api_key),
              hasUserToken: Boolean((business as Record<string, unknown>).afip_provider_user_token),
            }}
          />
        </SettingsSection>
      </div>

      <div className="mt-8">
        <SettingsSection
          icon={<Smartphone className="size-5" />}
          title="WhatsApp (360dialog)"
          description="Conectá la cuenta de WhatsApp del local para enviar avisos a clientes y notificaciones. La API key se guarda de forma segura y no se vuelve a mostrar."
        >
          <WhatsappConfigForm slug={business_slug} />
        </SettingsSection>
      </div>

      <div className="mt-8">
        <SettingsSection
          icon={<Bell className="size-5" />}
          title="Avisos del local"
          description="Elegí quién recibe cada aviso interno y por qué canal (en la app o WhatsApp)."
        >
          <NotificationPreferencesForm slug={business_slug} />
        </SettingsSection>
      </div>

      <div className="mt-8">
        <SettingsSection
          icon={<MessageCircle className="size-5" />}
          title="Mensajes de delivery por WhatsApp"
          description="Personalizá el mensaje que recibe el cliente en cada cambio de estado de su pedido."
        >
          <DeliveryTemplatesForm slug={business_slug} />
        </SettingsSection>
      </div>

      <div className="mt-8">
        <SettingsSection
          icon={<Mail className="size-5" />}
          title="Resumen de cierre por email"
          description="Recibí por mail el resumen del día (recaudación, facturación, mesas, por mozo y anulaciones) a la hora de cierre. Vacío en destinatarios = los admins del negocio."
        >
          <ShiftSummaryForm
            slug={business_slug}
            initial={{
              enabled: settings.closing_summary_enabled ?? false,
              hour: settings.closing_summary_hour ?? 23,
              recipients: settings.closing_summary_recipients ?? [],
            }}
          />
        </SettingsSection>
      </div>

    </PageShell>
  );
}

export const dynamic = "force-dynamic";
