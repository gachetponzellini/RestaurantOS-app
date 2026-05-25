import { notFound, redirect } from "next/navigation";

import { CreditCard } from "lucide-react";

import { BusinessSettingsForm } from "@/components/admin/settings/business-settings-form";
import { GenerateImagesCard } from "@/components/admin/settings/generate-images-card";
import { PaymentMethodsConfig } from "@/components/admin/settings/payment-methods-config";
import { SettingsSection } from "@/components/admin/settings/settings-section";
import { PageHeader, PageShell } from "@/components/admin/shell/page-shell";
import {
  canManageBusiness,
  ensureAdminAccess,
} from "@/lib/admin/context";
import { BRANDING_DEFAULTS } from "@/lib/branding/tokens";
import { getAllPaymentMethodConfigs } from "@/lib/caja/queries";
import { currentDayOfWeek } from "@/lib/day-of-week";
import { getMenu } from "@/lib/menu";
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
  const [menu, methodConfigs] = await Promise.all([
    getMenu(business.id, currentDayOfWeek(business.timezone)),
    getAllPaymentMethodConfigs(business.id),
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
          icon={<CreditCard className="size-5" />}
          title="Métodos de pago"
          description="Configurá recargos o descuentos por método de pago. Se aplican automáticamente al cobrar."
        >
          <PaymentMethodsConfig slug={business_slug} configs={methodConfigs} />
        </SettingsSection>
      </div>

      <div className="mt-8">
        <GenerateImagesCard slug={business_slug} />
      </div>
    </PageShell>
  );
}

export const dynamic = "force-dynamic";
