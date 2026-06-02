import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  BRANDING_DEFAULTS,
  ICON_STROKE_VALUE,
  ICON_STYLE_VALUE,
  RADIUS_PX,
  SHADOW_VALUE,
  fontCssVar,
} from "@/lib/branding/tokens";
import { getBusiness, getBusinessSettings } from "@/lib/tenant";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}): Promise<Metadata> {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) return {};
  const settings = getBusinessSettings(business);
  return {
    title: business.name,
    icons: settings.favicon_url ? { icon: settings.favicon_url } : undefined,
  };
}

export default async function BusinessLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  const s = getBusinessSettings(business);

  // Resolve every token → concrete value, falling back to defaults.
  const primary = s.primary_color ?? BRANDING_DEFAULTS.primary_color;
  const primaryFg = s.primary_foreground ?? BRANDING_DEFAULTS.primary_foreground;
  const secondary = s.secondary_color ?? BRANDING_DEFAULTS.secondary_color;
  const secondaryFg = s.secondary_foreground ?? BRANDING_DEFAULTS.secondary_foreground;
  // Accent ALWAYS mirrors primary. The form no longer exposes accent_color;
  // any stale legacy value in the DB is ignored so businesses don't stay
  // stuck on an old accent they can't see or edit.
  const accent = s.primary_color ?? BRANDING_DEFAULTS.primary_color;
  const accentFg = s.primary_foreground ?? BRANDING_DEFAULTS.primary_foreground;
  const mode = s.default_mode ?? BRANDING_DEFAULTS.default_mode;
  const backgroundLight = s.background_color ?? BRANDING_DEFAULTS.background_color;
  const backgroundDark = s.background_color_dark ?? BRANDING_DEFAULTS.background_color_dark;
  const background = mode === "dark" ? backgroundDark : backgroundLight;
  const muted = s.muted_color ?? BRANDING_DEFAULTS.muted_color;
  const border = s.border_color ?? BRANDING_DEFAULTS.border_color;
  const success = s.success_color ?? BRANDING_DEFAULTS.success_color;
  const warning = s.warning_color ?? BRANDING_DEFAULTS.warning_color;
  const destructive = s.destructive_color ?? BRANDING_DEFAULTS.destructive_color;

  const radius = RADIUS_PX[s.radius_scale ?? BRANDING_DEFAULTS.radius_scale];
  const shadowSubtle = SHADOW_VALUE[s.shadow_scale ?? BRANDING_DEFAULTS.shadow_scale];
  const iconStroke = ICON_STROKE_VALUE[s.icon_stroke_width ?? BRANDING_DEFAULTS.icon_stroke_width];
  const iconStyle = ICON_STYLE_VALUE[s.icon_style ?? BRANDING_DEFAULTS.icon_style];

  const fontSans = fontCssVar(s.font_body, BRANDING_DEFAULTS.font_body);
  const fontHeading = fontCssVar(s.font_heading, BRANDING_DEFAULTS.font_heading);

  // Emit tokens at two scopes:
  //   :root            → shadcn tokens (--primary, --secondary, --ring, ...)
  //   .delivery-theme  → public menu's custom palette (--accent, --accent-soft)
  //
  // Both get the same brand values so admin and customer-facing surfaces
  // stay consistent. Global tokens like --radius, --icon-stroke, --font-*
  // only need the :root scope (they cascade down).
  const css = `
:root{
  --primary:${primary};
  --primary-foreground:${primaryFg};
  --secondary:${secondary};
  --secondary-foreground:${secondaryFg};
  --accent:${accent};
  --accent-foreground:${accentFg};
  --background:${background};
  --muted:${muted};
  --border:${border};
  --success:${success};
  --warning:${warning};
  --destructive:${destructive};
  --ring:${primary};
  --brand:${primary};
  --brand-foreground:${primaryFg};
  --brand-soft:color-mix(in srgb, ${primary} 8%, ${background});
  --brand-hover:color-mix(in srgb, ${primary} 92%, #000000);
  --radius:${radius};
  --shadow-subtle:${shadowSubtle};
  --icon-stroke:${iconStroke};
  --icon-linecap:${iconStyle.linecap};
  --icon-linejoin:${iconStyle.linejoin};
  --font-sans:${fontSans};
  --font-heading:${fontHeading};
}
.delivery-theme{
  --accent:${accent};
  --accent-soft:color-mix(in oklch, ${accent} 6%, ${background});
  --bg:${background};
  --hairline:${border};
  --display:${fontHeading}, Georgia, serif;
  font-family: ${fontSans}, -apple-system, system-ui, sans-serif;
}
.dark .delivery-theme{
  --bg:${backgroundDark};
  --accent-soft:color-mix(in oklch, ${accent} 14%, ${backgroundDark});
}
[data-brand-scope]{
  --accent:${accent};
}
`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div className={mode === "dark" ? "dark" : undefined} data-brand-scope>
        {children}
      </div>
    </>
  );
}
