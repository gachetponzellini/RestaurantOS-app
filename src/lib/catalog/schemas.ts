import { z } from "zod";

import {
  SUPER_CATEGORY_COLORS,
  SUPER_CATEGORY_ICONS,
} from "@/lib/super-categories/visual";

export const CategoryInput = z.object({
  name: z.string().min(1, "Requerido.").max(60),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Sólo minúsculas, números y guiones."),
  sort_order: z.number().int().min(0),
  super_category_id: z.string().uuid().nullable().optional(),
  station_id: z.string().uuid().nullable().optional(),
});
export type CategoryInput = z.infer<typeof CategoryInput>;

export const StationInput = z.object({
  name: z.string().min(1, "Requerido.").max(60),
  sort_order: z.number().int().min(0),
  is_active: z.boolean(),
});
export type StationInput = z.infer<typeof StationInput>;

/**
 * Valida el destino de impresión de un sector: IPv4 de la LAN ("192.168.10.50")
 * o un hostname (RFC-1123, ej. "comandera-cocina.local"). Lógica pura testeable.
 * Un string que parece dotted-decimal se valida como IPv4 estricto (octetos
 * 0–255) para no aceptar "192.168.10.300" como si fuera un hostname numérico.
 */
export function isValidPrinterHost(host: string): boolean {
  if (/^[\d.]+$/.test(host)) {
    const parts = host.split(".");
    return (
      parts.length === 4 &&
      parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
    );
  }
  return /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(
    host,
  );
}

/**
 * Config de la comandera de un sector (spec 28). La IP no es secreto (LAN), va
 * en columnas de `stations`. IP vacía → null = "sector sin impresora" (el print
 * agent lo saltea). Puerto 1–65535, default 9100 (RAW/JetDirect ESC/POS).
 */
export const StationPrinterInput = z.object({
  printer_ip: z
    .union([z.string(), z.null()])
    .transform((v) => {
      if (v == null) return null;
      const trimmed = v.trim();
      return trimmed === "" ? null : trimmed;
    })
    .refine((v) => v === null || isValidPrinterHost(v), {
      message: "IP o host inválido (ej: 192.168.10.50 o comandera-cocina.local).",
    }),
  printer_port: z
    .number({ message: "Puerto inválido." })
    .int("El puerto debe ser un número entero.")
    .min(1, "El puerto debe estar entre 1 y 65535.")
    .max(65535, "El puerto debe estar entre 1 y 65535.")
    .default(9100),
  printer_enabled: z.boolean().default(true),
});
export type StationPrinterInput = z.infer<typeof StationPrinterInput>;

export const SuperCategoryInput = z.object({
  name: z.string().min(1, "Requerido.").max(60),
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Sólo minúsculas, números y guiones."),
  sort_order: z.number().int().min(0),
  icon: z.enum(SUPER_CATEGORY_ICONS),
  color: z.enum(SUPER_CATEGORY_COLORS),
  is_active: z.boolean(),
});
export type SuperCategoryInput = z.infer<typeof SuperCategoryInput>;

export const ModifierInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(60),
  price_delta_cents: z.number().int().min(0),
  is_available: z.boolean(),
  sort_order: z.number().int().min(0),
});
export type ModifierInput = z.infer<typeof ModifierInput>;

export const ModifierGroupInput = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(60),
    min_selection: z.number().int().min(0),
    max_selection: z.number().int().min(1),
    is_required: z.boolean(),
    sort_order: z.number().int().min(0),
    modifiers: z.array(ModifierInput),
  })
  .refine((g) => g.max_selection >= g.min_selection, {
    message: "Máximo debe ser ≥ mínimo.",
    path: ["max_selection"],
  });
export type ModifierGroupInput = z.infer<typeof ModifierGroupInput>;

export const ProductInput = z.object({
  name: z.string().min(1, "Requerido.").max(80),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Sólo minúsculas, números y guiones."),
  description: z.string().max(500).optional(),
  price_cents: z.number().int().min(0),
  image_url: z.string().url().nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  station_id: z.string().uuid().nullable().optional(),
  is_available: z.boolean(),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0),
  prep_time_minutes: z.number().int().min(1).max(999).nullable().optional(),
  modifier_groups: z.array(ModifierGroupInput),
});
export type ProductInput = z.infer<typeof ProductInput>;

const GARNISH_PATTERN = /^guarnici[oó]n(es)?$/i;

export function warnGarnishModifierGroups(
  groups: ModifierGroupInput[],
): string[] {
  return groups
    .filter((g) => GARNISH_PATTERN.test(g.name.trim()))
    .map(
      (g) =>
        `El grupo "${g.name}" parece una guarnición. Convención: la guarnición se carga como producto aparte, no como adicional del plato.`,
    );
}
