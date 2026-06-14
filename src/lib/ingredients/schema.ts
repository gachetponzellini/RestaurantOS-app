import { z } from "zod";

// ── Ingredient ───────────────────────────────────────────────────

export const IngredientInput = z.object({
  name: z.string().min(1, "Requerido.").max(100),
  unit: z.enum(["kg", "lt", "un", "g", "ml"]),
  waste_percent: z
    .number()
    .min(0, "No puede ser negativo.")
    .max(99.99, "Debe ser menor a 100."),
  stock_min_alert: z.number().min(0).nullable().optional(),
  is_active: z.boolean(),
  is_composite: z.boolean().optional(),
});
export type IngredientInput = z.infer<typeof IngredientInput>;

// ── Presentation ─────────────────────────────────────────────────

export const PresentationInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Requerido.").max(100),
  net_quantity: z.number().positive("Debe ser mayor a 0."),
  cost_cents: z.number().int().min(0, "No puede ser negativo."),
  is_default: z.boolean(),
});
export type PresentationInput = z.infer<typeof PresentationInput>;

// ── Recipe line ──────────────────────────────────────────────────

export const RecipeLineInput = z.object({
  ingredient_id: z.string().uuid("Ingrediente inválido."),
  quantity: z.number().positive("Debe ser mayor a 0."),
  notes: z.string().max(200).nullable().optional(),
});
export type RecipeLineInput = z.infer<typeof RecipeLineInput>;

// ── Stock ingreso ────────────────────────────────────────────────

export const StockIngresoInput = z.object({
  ingredient_id: z.string().uuid(),
  presentation_id: z.string().uuid(),
  /** Number of presentation units (e.g. "3 bolsas de 5kg") */
  units: z.number().positive("Debe ser mayor a 0."),
  reason: z.string().max(200).optional(),
});
export type StockIngresoInput = z.infer<typeof StockIngresoInput>;

// ── Stock ajuste ─────────────────────────────────────────────────

export const StockAjusteInput = z.object({
  ingredient_id: z.string().uuid(),
  /** Positive = add, negative = subtract (in base unit) */
  quantity: z.number().refine((v) => v !== 0, "No puede ser 0."),
  reason: z.string().min(1, "El motivo es obligatorio.").max(200),
});
export type StockAjusteInput = z.infer<typeof StockAjusteInput>;

// ── Import masivo de insumos (spec 10) ───────────────────────────
// Una fila ya parseada del Excel/CSV de MaxiRest. El parseo del archivo se
// hace en el cliente; la action recibe filas y valida cada una con Zod.

export const IngredientImportRow = z.object({
  name: z.string().trim().min(1, "Nombre requerido.").max(100),
  unit: z.enum(["kg", "lt", "un", "g", "ml"], {
    message: "Unidad inválida (kg, lt, un, g, ml).",
  }),
  waste_percent: z
    .number()
    .min(0, "No puede ser negativo.")
    .max(99.99, "Debe ser menor a 100.")
    .default(0),
  /** Nombre de la presentación default (ej. "Bolsa 5kg"). */
  presentation_name: z.string().trim().min(1).max(100).default("Default"),
  /** Cantidad neta de la presentación, en unidad base. */
  net_quantity: z.number().positive("Debe ser mayor a 0."),
  /** Costo de la presentación en centavos. */
  cost_cents: z.number().int("Debe ser entero.").min(0, "No puede ser negativo."),
  /** Stock inicial en unidad base. */
  stock_initial: z.number().min(0, "No puede ser negativo.").default(0),
});
export type IngredientImportRow = z.infer<typeof IngredientImportRow>;

// ── Sub-recipe line (ingrediente compuesto → sub-ingrediente) ───

export const IngredientRecipeLineInput = z.object({
  child_ingredient_id: z.string().uuid("Ingrediente inválido."),
  quantity: z.number().positive("Debe ser mayor a 0."),
  notes: z.string().max(200).nullable().optional(),
});
export type IngredientRecipeLineInput = z.infer<typeof IngredientRecipeLineInput>;
