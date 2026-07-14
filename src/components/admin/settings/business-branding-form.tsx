"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ExternalLink,
  Moon,
  Palette,
  Shapes,
  ShoppingBag,
  Sparkles,
  Sun,
} from "lucide-react";

import { SettingsSection } from "@/components/admin/settings/settings-section";
import { SaveBar } from "@/components/admin/settings/settings-form-primitives";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImageUploader } from "@/components/admin/catalog/image-uploader";
import {
  MenuPreview,
  type PreviewProduct,
} from "@/components/admin/settings/menu-preview";
import { updateBusinessBranding } from "@/lib/admin/business-actions";
import {
  DENSITY_SCALE,
  FONT_KEYS,
  FONT_OPTIONS,
  ICON_STROKE_SCALE,
  ICON_STROKE_VALUE,
  ICON_STYLE_SCALE,
  MODE_SCALE,
  RADIUS_PX,
  RADIUS_SCALE,
  SHADOW_SCALE,
  SHADOW_VALUE,
  type FontKey,
  type IconStroke,
  type IconStyle,
  type Mode,
  type RadiusScale,
  type ShadowScale,
} from "@/lib/branding/tokens";
import { cn } from "@/lib/utils";

const HexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Color inválido.");

const Schema = z.object({
  logo_url: z.string().nullable(),
  cover_image_url: z.string().nullable(),
  logo_mark_url: z.string().nullable(),
  logo_mono_url: z.string().nullable(),
  favicon_url: z.string().nullable(),
  primary_color: HexColor,
  primary_foreground: HexColor,
  secondary_color: HexColor,
  secondary_foreground: HexColor,
  accent_color: HexColor,
  accent_foreground: HexColor,
  background_color: HexColor,
  background_color_dark: HexColor,
  surface_color: HexColor,
  muted_color: HexColor,
  border_color: HexColor,
  success_color: HexColor,
  warning_color: HexColor,
  destructive_color: HexColor,
  font_heading: z.enum(FONT_KEYS),
  font_body: z.enum(FONT_KEYS),
  radius_scale: z.enum(RADIUS_SCALE),
  shadow_scale: z.enum(SHADOW_SCALE),
  density: z.enum(DENSITY_SCALE),
  icon_stroke_width: z.enum(ICON_STROKE_SCALE),
  icon_style: z.enum(ICON_STYLE_SCALE),
  default_mode: z.enum(MODE_SCALE),
});

type Values = z.infer<typeof Schema>;

// Contexto no editable acá (nombre/dirección/envío viven en la sección Negocio);
// se pasa como props para que el preview del menú se vea realista.
type PreviewContext = {
  businessName: string;
  tagline?: string | null;
  deliveryFeeCents: number;
  minOrderCents: number;
  estimatedMinutes: number | null;
};

export function BusinessBrandingForm({
  slug,
  businessId,
  initial,
  sampleProducts,
  previewContext,
}: {
  slug: string;
  businessId: string;
  initial: Values;
  sampleProducts: PreviewProduct[];
  previewContext: PreviewContext;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: initial,
  });

  const onSubmit = async (values: Values) => {
    setSubmitting(true);
    try {
      const r = await updateBusinessBranding({
        business_slug: slug,
        ...values,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Configuración guardada.");
      form.reset(values);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const logoUrl = form.watch("logo_url");
  const logoMarkUrl = form.watch("logo_mark_url");
  const logoMonoUrl = form.watch("logo_mono_url");
  const faviconUrl = form.watch("favicon_url");
  const coverImageUrl = form.watch("cover_image_url");
  const primaryValue = form.watch("primary_color");
  const primaryFgValue = form.watch("primary_foreground");
  const backgroundLight = form.watch("background_color");
  const backgroundDark = form.watch("background_color_dark");
  const fontHeadingValue = form.watch("font_heading");
  const fontBodyValue = form.watch("font_body");
  const radiusValue = form.watch("radius_scale");
  const shadowValue = form.watch("shadow_scale");
  const strokeValue = form.watch("icon_stroke_width");
  const iconStyleValue = form.watch("icon_style");
  const modeValue = form.watch("default_mode");

  return (
    <Form {...form}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid min-w-0 gap-6"
        >
          <SettingsSection
            icon={<Sparkles className="size-5" strokeWidth={1.75} />}
            title="Identidad y marca"
            description="Foto del local, logo y los colores que definen el estilo del menú."
          >
            <Tabs defaultValue="assets">
              <TabsList className="no-scrollbar w-full justify-start overflow-x-auto">
                <TabsTrigger value="assets">
                  <Sparkles className="size-3.5" /> Identidad visual
                </TabsTrigger>
                <TabsTrigger value="colors">
                  <Palette className="size-3.5" /> Colores
                </TabsTrigger>
                <TabsTrigger value="style">
                  <Shapes className="size-3.5" /> Estilo
                </TabsTrigger>
              </TabsList>

              <TabsContent value="assets" className="grid gap-6 pt-4">
                <IdentityHero
                  coverUrl={coverImageUrl}
                  logoUrl={logoUrl}
                  businessId={businessId}
                  onCoverChange={(url) =>
                    form.setValue("cover_image_url", url, { shouldDirty: true })
                  }
                  onLogoChange={(url) =>
                    form.setValue("logo_url", url, { shouldDirty: true })
                  }
                />
                <LogoVariants
                  markUrl={logoMarkUrl}
                  monoUrl={logoMonoUrl}
                  faviconUrl={faviconUrl}
                  businessId={businessId}
                  onMarkChange={(url) =>
                    form.setValue("logo_mark_url", url, { shouldDirty: true })
                  }
                  onMonoChange={(url) =>
                    form.setValue("logo_mono_url", url, { shouldDirty: true })
                  }
                  onFaviconChange={(url) =>
                    form.setValue("favicon_url", url, { shouldDirty: true })
                  }
                />
              </TabsContent>

              <TabsContent value="colors" className="grid gap-6 pt-4">
                <TabHeader
                  title="Colores de marca"
                  description="El primario se aplica a botones, acentos y CTAs. El texto sobre primario es el color del texto dentro de esos botones."
                />
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,260px)]">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="primary_color"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Color primario</FormLabel>
                          <FormControl>
                            <ColorInput
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="primary_foreground"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Texto sobre primario</FormLabel>
                          <FormControl>
                            <ColorInput
                              value={field.value}
                              onChange={field.onChange}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <BrandPreview
                    primary={primaryValue}
                    foreground={primaryFgValue}
                  />
                </div>
                <PaletteExtended form={form} />
                <BackgroundColors form={form} />
                <TabHeader
                  title="Modo por defecto"
                  description="Cómo ven el menú tus clientes al entrar. Cada modo usa el fondo de arriba."
                />
                <ModePicker form={form} />
              </TabsContent>

              <TabsContent value="style" className="grid gap-6 pt-4">
                <TabHeader
                  title="Tipografía"
                  description="Elegí una fuente para títulos y otra para el cuerpo de texto. Todas están pre-cargadas y optimizadas."
                />
                <TypographyPicker form={form} />
                <TabHeader
                  title="Íconos"
                  description="El grosor y estilo afectan el feel global del menú."
                />
                <IconStrokePicker form={form} />
                <TabHeader
                  title="Forma"
                  description="Qué tan redondeadas son las esquinas y qué tan marcadas son las sombras."
                />
                <ShapePicker form={form} />
              </TabsContent>
            </Tabs>
          </SettingsSection>

          <SaveBar
            dirty={form.formState.isDirty}
            submitting={submitting}
            onDiscard={() => form.reset(initial)}
          />
        </form>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200/70">
            <header className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                  Preview
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-emerald-700">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  En vivo
                </span>
              </div>
              <a
                href={`/${slug}/menu`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-2.5 py-1 text-[0.65rem] font-semibold text-zinc-50 transition hover:bg-zinc-700"
                title="Abrir el menú público real"
              >
                Abrir menú
                <ExternalLink className="size-3" strokeWidth={2} />
              </a>
            </header>
            <div className="mt-4">
              <MenuPreview
                businessName={previewContext.businessName}
                logoUrl={logoUrl}
                coverImageUrl={coverImageUrl}
                primary={primaryValue}
                primaryForeground={primaryFgValue}
                background={
                  modeValue === "dark" ? backgroundDark : backgroundLight
                }
                fontHeading={fontHeadingValue}
                fontBody={fontBodyValue}
                radiusScale={radiusValue}
                shadowScale={shadowValue}
                iconStroke={strokeValue}
                iconStyle={iconStyleValue}
                mode={modeValue}
                products={sampleProducts}
                tagline={previewContext.tagline}
                deliveryFeeCents={previewContext.deliveryFeeCents}
                minOrderCents={previewContext.minOrderCents}
                estimatedMinutes={previewContext.estimatedMinutes}
              />
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              Los cambios se aplican al guardar. Guardá para que los vean los
              clientes.
            </p>
          </div>
        </aside>
      </div>
    </Form>
  );
}

// ——— Identity assets: cover + logo cards ———
function IdentityHero({
  coverUrl,
  logoUrl,
  businessId,
  onCoverChange,
  onLogoChange,
}: {
  coverUrl: string | null;
  logoUrl: string | null;
  businessId: string;
  onCoverChange: (url: string | null) => void;
  onLogoChange: (url: string | null) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="flex flex-col rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200/60 sm:col-span-2">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Foto del local
            </p>
            <p className="text-xs text-zinc-600">Banner del menú público</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600 ring-1 ring-zinc-200">
            <Sparkles className="size-2.5" />
            16:9
          </span>
        </header>
        <ImageUploader
          businessId={businessId}
          value={coverUrl}
          onChange={onCoverChange}
          pathPrefix="cover"
          variant="cover"
        />
      </div>

      <div className="flex flex-col rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200/60">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Logo
            </p>
            <p className="text-xs text-zinc-600">Marca del negocio</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-600 ring-1 ring-zinc-200">
            1:1
          </span>
        </header>
        <div className="flex flex-1 items-center justify-center">
          <ImageUploader
            businessId={businessId}
            value={logoUrl}
            onChange={onLogoChange}
            pathPrefix="logo"
            variant="avatar-circle"
            layout="stacked"
          />
        </div>
      </div>
    </div>
  );
}

// ——— Brand live preview ———
function BrandPreview({
  primary,
  foreground,
}: {
  primary: string;
  foreground: string;
}) {
  const style = useMemo(
    () =>
      ({
        "--p": /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(primary)
          ? primary
          : "#e11d48",
        "--pf": /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(foreground)
          ? foreground
          : "#ffffff",
      }) as React.CSSProperties,
    [primary, foreground],
  );

  return (
    <div
      style={style}
      className="grid gap-3 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200/60"
    >
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
        Preview
      </p>
      <button
        type="button"
        className="inline-flex h-10 items-center justify-center rounded-full px-5 text-sm font-semibold shadow-[0_8px_20px_-12px_var(--p)]"
        style={{ background: "var(--p)", color: "var(--pf)" }}
      >
        Confirmar pedido
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider"
          style={{
            background: `color-mix(in srgb, var(--p) 12%, white)`,
            color: "var(--p)",
          }}
        >
          Nuevo
        </span>
        <span
          className="text-xs font-semibold underline-offset-2 hover:underline"
          style={{ color: "var(--p)" }}
        >
          Ver menú completo
        </span>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <span
          className="size-6 rounded-full ring-1 ring-black/10"
          style={{ background: "var(--p)" }}
        />
        <span
          className="size-6 rounded-full ring-1 ring-black/10"
          style={{ background: "var(--pf)" }}
        />
        <span className="font-mono text-[0.65rem] uppercase text-zinc-500">
          {primary} · {foreground}
        </span>
      </div>
    </div>
  );
}

function ColorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const isValid = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
  const safe = isValid ? value : "#000000";
  return (
    <div className="group relative flex h-11 items-center gap-0 overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200 transition focus-within:ring-2 focus-within:ring-zinc-900/20 hover:ring-zinc-300">
      <label
        className="relative grid h-full w-11 shrink-0 cursor-pointer place-items-center"
        style={{ background: safe }}
      >
        <input
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label="Elegir color"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/10"
        />
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="#E11D48"
        spellCheck={false}
        className="flex-1 bg-transparent px-3 font-mono text-sm uppercase tracking-wide text-zinc-800 outline-none placeholder:text-zinc-300"
      />
    </div>
  );
}

// ─── Tab header (small title + description for each tab block) ─────────
function TabHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
      {description ? (
        <p className="text-xs text-zinc-500">{description}</p>
      ) : null}
    </div>
  );
}

// ─── Logo variants (isotipo + monocromo + favicon) ──────────────────────
function LogoVariants({
  markUrl,
  monoUrl,
  faviconUrl,
  businessId,
  onMarkChange,
  onMonoChange,
  onFaviconChange,
}: {
  markUrl: string | null;
  monoUrl: string | null;
  faviconUrl: string | null;
  businessId: string;
  onMarkChange: (url: string | null) => void;
  onMonoChange: (url: string | null) => void;
  onFaviconChange: (url: string | null) => void;
}) {
  return (
    <div className="grid gap-4">
      <TabHeader
        title="Variantes de logo"
        description="Opcionales. El isotipo se usa donde hay poco espacio, el monocromo en fondos oscuros, y el favicon en la pestaña del navegador."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <MiniUploadCard
          title="Isotipo"
          hint="Marca sin texto, cuadrada"
          businessId={businessId}
          value={markUrl}
          onChange={onMarkChange}
          pathPrefix="logo-mark"
        />
        <MiniUploadCard
          title="Monocromo"
          hint="Para fondos oscuros"
          businessId={businessId}
          value={monoUrl}
          onChange={onMonoChange}
          pathPrefix="logo-mono"
        />
        <MiniUploadCard
          title="Favicon"
          hint="Icono del navegador (32×32)"
          businessId={businessId}
          value={faviconUrl}
          onChange={onFaviconChange}
          pathPrefix="favicon"
        />
      </div>
    </div>
  );
}

function MiniUploadCard({
  title,
  hint,
  businessId,
  value,
  onChange,
  pathPrefix,
}: {
  title: string;
  hint: string;
  businessId: string;
  value: string | null;
  onChange: (url: string | null) => void;
  pathPrefix: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200/60">
      <header className="mb-3">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          {title}
        </p>
        <p className="text-xs text-zinc-600">{hint}</p>
      </header>
      <div className="flex flex-1 items-center justify-center">
        <ImageUploader
          businessId={businessId}
          value={value}
          onChange={onChange}
          pathPrefix={pathPrefix}
          variant="avatar-circle"
          layout="stacked"
        />
      </div>
    </div>
  );
}

// ─── Extended palette (secondary / accent / semantic) ──────────────────
function PaletteExtended({ form }: { form: UseFormReturn<Values> }) {
  const brand: { name: keyof Values; label: string }[] = [
    { name: "secondary_color", label: "Secundario" },
  ];
  const semantic: { name: keyof Values; label: string }[] = [
    { name: "success_color", label: "Éxito" },
    { name: "warning_color", label: "Aviso" },
    { name: "destructive_color", label: "Error" },
  ];
  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <TabHeader
          title="Color secundario"
          description="Complementa al primario — se usa en superficies neutras y acentos del UI."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {brand.map((f) => (
            <FormField
              key={f.name}
              control={form.control}
              name={f.name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{f.label}</FormLabel>
                  <FormControl>
                    <ColorInput
                      value={(field.value as string) ?? ""}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>
      </div>
      <div className="grid gap-4">
        <TabHeader
          title="Colores semánticos"
          description="Se usan en mensajes de éxito, aviso y error."
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {semantic.map((f) => (
            <FormField
              key={f.name}
              control={form.control}
              name={f.name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{f.label}</FormLabel>
                  <FormControl>
                    <ColorInput
                      value={(field.value as string) ?? ""}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Background colors (per mode) ──────────────────────────────────────
function BackgroundColors({ form }: { form: UseFormReturn<Values> }) {
  const fields: { name: keyof Values; label: string; hint: string }[] = [
    {
      name: "background_color",
      label: "Fondo — modo claro",
      hint: "Se aplica cuando el modo por defecto es Claro.",
    },
    {
      name: "background_color_dark",
      label: "Fondo — modo oscuro",
      hint: "Se aplica cuando el modo por defecto es Oscuro.",
    },
  ];
  return (
    <div className="grid gap-4">
      <TabHeader
        title="Color de fondo"
        description="Un color por cada modo. El que se aplica depende del modo por defecto (abajo)."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <FormField
            key={f.name}
            control={form.control}
            name={f.name}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{f.label}</FormLabel>
                <FormControl>
                  <ColorInput
                    value={(field.value as string) ?? ""}
                    onChange={field.onChange}
                  />
                </FormControl>
                <p className="text-xs text-zinc-500">{f.hint}</p>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Typography ────────────────────────────────────────────────────────
function TypographyPicker({ form }: { form: UseFormReturn<Values> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField
        control={form.control}
        name="font_heading"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Títulos (display)</FormLabel>
            <FormControl>
              <FontSelect value={field.value} onChange={field.onChange} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="font_body"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Cuerpo de texto</FormLabel>
            <FormControl>
              <FontSelect value={field.value} onChange={field.onChange} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function FontSelect({
  value,
  onChange,
}: {
  value: FontKey;
  onChange: (v: FontKey) => void;
}) {
  const selected = FONT_OPTIONS.find((o) => o.key === value) ?? FONT_OPTIONS[0]!;
  return (
    <Select value={value} onValueChange={(v) => onChange(v as FontKey)}>
      <SelectTrigger className="h-11">
        <SelectValue>
          <span
            className="truncate text-base"
            style={{ fontFamily: selected.cssVar }}
          >
            {selected.label}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {FONT_OPTIONS.map((o) => (
          <SelectItem key={o.key} value={o.key}>
            <span className="flex flex-col">
              <span className="text-base" style={{ fontFamily: o.cssVar }}>
                {o.label}
              </span>
              <span
                className="text-[0.65rem] text-zinc-500"
                style={{ fontFamily: o.cssVar }}
              >
                {o.sample}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Shape (radius + shadow) ───────────────────────────────────────────
function ShapePicker({ form }: { form: UseFormReturn<Values> }) {
  return (
    <div className="grid gap-5">
      <FormField
        control={form.control}
        name="radius_scale"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Radio de esquinas</FormLabel>
            <FormControl>
              <RadiusRadio value={field.value} onChange={field.onChange} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="shadow_scale"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Sombras</FormLabel>
            <FormControl>
              <ShadowRadio value={field.value} onChange={field.onChange} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function PickerGrid({
  cols,
  children,
}: {
  cols: 2 | 3 | 4;
  children: React.ReactNode;
}) {
  const gridCls =
    cols === 4 ? "grid-cols-4" : cols === 3 ? "grid-cols-3" : "grid-cols-2";
  return <div className={cn("grid gap-2", gridCls)}>{children}</div>;
}

function PickerCard({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2.5 rounded-xl border p-3 text-center transition",
        active
          ? "border-zinc-900 bg-zinc-900/5 ring-1 ring-zinc-900/10"
          : "border-zinc-200 bg-white hover:border-zinc-300",
      )}
    >
      {children}
      <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-zinc-700">
        {label}
      </span>
    </button>
  );
}

function RadiusRadio({
  value,
  onChange,
}: {
  value: RadiusScale;
  onChange: (v: RadiusScale) => void;
}) {
  const labels: Record<RadiusScale, string> = {
    sharp: "Duro",
    standard: "Estándar",
    soft: "Suave",
    pill: "Pastilla",
  };
  return (
    <PickerGrid cols={4}>
      {RADIUS_SCALE.map((k) => (
        <PickerCard
          key={k}
          active={value === k}
          label={labels[k]}
          onClick={() => onChange(k)}
        >
          <div
            className="h-8 w-12 bg-zinc-900"
            style={{ borderRadius: RADIUS_PX[k] }}
          />
        </PickerCard>
      ))}
    </PickerGrid>
  );
}

function ShadowRadio({
  value,
  onChange,
}: {
  value: ShadowScale;
  onChange: (v: ShadowScale) => void;
}) {
  const labels: Record<ShadowScale, string> = {
    flat: "Plano",
    subtle: "Sutil",
    elevated: "Elevado",
  };
  return (
    <PickerGrid cols={3}>
      {SHADOW_SCALE.map((k) => (
        <PickerCard
          key={k}
          active={value === k}
          label={labels[k]}
          onClick={() => onChange(k)}
        >
          {/* Off-white backdrop so subtle shadows are visible */}
          <div className="flex h-16 w-full items-center justify-center rounded-lg bg-zinc-50">
            <div
              className="h-8 w-14 rounded-lg bg-white"
              style={{ boxShadow: SHADOW_VALUE[k] }}
            />
          </div>
        </PickerCard>
      ))}
    </PickerGrid>
  );
}

// ─── Icon stroke + style ──────────────────────────────────────────────
function IconStrokePicker({ form }: { form: UseFormReturn<Values> }) {
  return (
    <div className="grid gap-5">
      <FormField
        control={form.control}
        name="icon_stroke_width"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Peso de íconos</FormLabel>
            <FormControl>
              <StrokeRadio value={field.value} onChange={field.onChange} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="icon_style"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Estilo de líneas</FormLabel>
            <FormControl>
              <IconStyleRadio value={field.value} onChange={field.onChange} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function StrokeRadio({
  value,
  onChange,
}: {
  value: IconStroke;
  onChange: (v: IconStroke) => void;
}) {
  const labels: Record<IconStroke, string> = {
    thin: "Fino",
    regular: "Regular",
    medium: "Medio",
    bold: "Grueso",
  };
  return (
    <PickerGrid cols={4}>
      {ICON_STROKE_SCALE.map((k) => (
        <PickerCard
          key={k}
          active={value === k}
          label={labels[k]}
          onClick={() => onChange(k)}
        >
          <ShoppingBag
            className="size-6 text-zinc-700"
            style={{ strokeWidth: ICON_STROKE_VALUE[k] }}
          />
        </PickerCard>
      ))}
    </PickerGrid>
  );
}

function IconStyleRadio({
  value,
  onChange,
}: {
  value: IconStyle;
  onChange: (v: IconStyle) => void;
}) {
  const labels: Record<IconStyle, string> = {
    rounded: "Redondeado",
    sharp: "Angular",
  };
  return (
    <PickerGrid cols={2}>
      {ICON_STYLE_SCALE.map((k) => {
        const isRounded = k === "rounded";
        return (
          <PickerCard
            key={k}
            active={value === k}
            label={labels[k]}
            onClick={() => onChange(k)}
          >
            <ShoppingBag
              className="size-6 text-zinc-700"
              style={{
                strokeWidth: 2,
                strokeLinecap: isRounded ? "round" : "butt",
                strokeLinejoin: isRounded ? "round" : "miter",
              }}
            />
          </PickerCard>
        );
      })}
    </PickerGrid>
  );
}

// ─── Mode (light/dark default) ────────────────────────────────────────
function ModePicker({ form }: { form: UseFormReturn<Values> }) {
  const mode = form.watch("default_mode");
  const bgLight = form.watch("background_color");
  const bgDark = form.watch("background_color_dark");
  return (
    <FormField
      control={form.control}
      name="default_mode"
      render={({ field }) => (
        <FormItem>
          <FormControl>
            <div className="grid gap-3 sm:grid-cols-2">
              <ModeCard
                mode="light"
                active={mode === "light"}
                bgValue={bgLight}
                onSelect={() => field.onChange("light" satisfies Mode)}
              />
              <ModeCard
                mode="dark"
                active={mode === "dark"}
                bgValue={bgDark}
                onSelect={() => field.onChange("dark" satisfies Mode)}
              />
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ModeCard({
  mode,
  active,
  bgValue,
  onSelect,
}: {
  mode: Mode;
  active: boolean;
  bgValue: string;
  onSelect: () => void;
}) {
  const isLight = mode === "light";
  const safe = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(bgValue)
    ? bgValue
    : isLight
      ? "#FFFFFF"
      : "#0B0B0D";
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl border p-4 text-left transition",
        active
          ? "border-zinc-900 bg-zinc-900/5 ring-1 ring-zinc-900/10"
          : "border-zinc-200 hover:border-zinc-300",
      )}
    >
      <div
        className="flex size-12 items-center justify-center rounded-xl"
        style={{
          background: safe,
          color: isLight ? "#18181B" : "#F4F4F5",
          boxShadow: "inset 0 0 0 1px rgb(0 0 0 / 0.08)",
        }}
      >
        {isLight ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          {isLight ? "Claro" : "Oscuro"}
          {active ? (
            <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-zinc-50">
              Por defecto
            </span>
          ) : null}
        </p>
        <p className="text-xs text-zinc-500">
          {isLight ? "Fondo claro, texto oscuro" : "Fondo oscuro, texto claro"}
        </p>
      </div>
    </button>
  );
}
