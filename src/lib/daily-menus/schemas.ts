import { z } from "zod";

export const DailyMenuComponentInput = z
  .object({
    id: z.string().uuid().optional(),
    label: z.string().min(1, "Requerido.").max(120),
    description: z.string().max(280).optional().nullable(),
    kind: z.enum(["text", "product", "choice"]),
    product_id: z.string().uuid().optional().nullable(),
    choice_group_id: z.string().uuid().optional().nullable(),
    choice_group_label: z.string().max(80).optional().nullable(),
    // Adicional de la opción (spec 29). Sólo aplica a `choice`; pesos→centavos
    // en el form. Nunca negativo (también `check` en DB). Opcional —no
    // `.default()`— para no divergir input/output de Zod y romper la inferencia
    // de react-hook-form; el default 0 lo aplica la columna DB y los consumidores.
    extra_price_cents: z.number().int().min(0).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "product" && !data.product_id) {
      ctx.addIssue({
        code: "custom",
        message: "Seleccioná un producto.",
        path: ["product_id"],
      });
    }
    if (data.kind === "choice") {
      if (!data.product_id) {
        ctx.addIssue({
          code: "custom",
          message: "Seleccioná un producto.",
          path: ["product_id"],
        });
      }
      if (!data.choice_group_id) {
        ctx.addIssue({
          code: "custom",
          message: "Falta el grupo de opciones.",
          path: ["choice_group_id"],
        });
      }
    }
  });
export type DailyMenuComponentInput = z.infer<typeof DailyMenuComponentInput>;

export const DisplayContext = z.enum(["delivery", "salon", "both"]);
export type DisplayContext = z.infer<typeof DisplayContext>;

export const DailyMenuInput = z.object({
  name: z.string().min(1, "Requerido.").max(80),
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, "Sólo minúsculas, números y guiones."),
  description: z.string().max(500).optional().nullable(),
  price_cents: z.number().int().min(0),
  image_url: z.string().url().nullable().optional(),
  available_days: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Elegí al menos un día."),
  is_active: z.boolean(),
  is_available: z.boolean(),
  sort_order: z.number().int().min(0),
  display_context: DisplayContext,
  is_suggestion: z.boolean(),
  components: z
    .array(DailyMenuComponentInput)
    .min(1, "Agregá al menos un componente."),
});
export type DailyMenuInput = z.infer<typeof DailyMenuInput>;
