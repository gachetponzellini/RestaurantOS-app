import { notFound } from "next/navigation";

import { BusinessBrandingForm } from "@/components/admin/settings/business-branding-form";
import { BRANDING_DEFAULTS } from "@/lib/branding/tokens";
import { currentDayOfWeek } from "@/lib/day-of-week";
import { getMenu } from "@/lib/menu";
import { getBusiness, getBusinessSettings } from "@/lib/tenant";

// Ajustes › Apariencia: identidad visual, colores, tipografía/forma/íconos y
// preview en vivo del menú. Nombre/dirección/envío viven en Negocio; se pasan
// como contexto de sólo lectura para que el preview se vea realista.
export default async function ConfiguracionAparienciaPage({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  const settings = getBusinessSettings(business);
  const menu = await getMenu(business.id, currentDayOfWeek(business.timezone));

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
    logo_url: business.logo_url ?? null,
    cover_image_url: business.cover_image_url ?? null,
    logo_mark_url: settings.logo_mark_url ?? null,
    logo_mono_url: settings.logo_mono_url ?? null,
    favicon_url: settings.favicon_url ?? null,
    primary_color: hex(settings.primary_color, BRANDING_DEFAULTS.primary_color),
    primary_foreground: hex(
      settings.primary_foreground,
      BRANDING_DEFAULTS.primary_foreground,
    ),
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
    font_heading: settings.font_heading ?? BRANDING_DEFAULTS.font_heading,
    font_body: settings.font_body ?? BRANDING_DEFAULTS.font_body,
    radius_scale: settings.radius_scale ?? BRANDING_DEFAULTS.radius_scale,
    shadow_scale: settings.shadow_scale ?? BRANDING_DEFAULTS.shadow_scale,
    density: settings.density ?? BRANDING_DEFAULTS.density,
    icon_stroke_width:
      settings.icon_stroke_width ?? BRANDING_DEFAULTS.icon_stroke_width,
    icon_style: settings.icon_style ?? BRANDING_DEFAULTS.icon_style,
    default_mode: settings.default_mode ?? BRANDING_DEFAULTS.default_mode,
  };

  return (
    <BusinessBrandingForm
      slug={business_slug}
      businessId={business.id}
      initial={initial}
      sampleProducts={sampleProducts}
      previewContext={{
        businessName: business.name,
        tagline: business.address,
        deliveryFeeCents: Number(business.delivery_fee_cents ?? 0),
        minOrderCents: Number(business.min_order_cents ?? 0),
        estimatedMinutes: business.estimated_delivery_minutes,
      }}
    />
  );
}

export const dynamic = "force-dynamic";
