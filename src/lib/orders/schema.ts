import { z } from "zod";

/**
 * Ítem de carrito. Puede ser un producto normal o un menú del día (combo).
 * Usamos un discriminated union por `kind` — omitirlo defaultea a `"product"`
 * por back-compat con ítems persistidos antes de la feature.
 */
const OrderProductItem = z.object({
  kind: z.literal("product").optional(),
  product_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  notes: z.string().max(200).optional(),
  modifier_ids: z.array(z.string().uuid()).default([]),
});

const OrderSelectedChoice = z.object({
  choice_group_id: z.string().uuid(),
  choice_group_label: z.string(),
  product_id: z.string().uuid(),
  product_name: z.string(),
  modifier_ids: z.array(z.string().uuid()).default([]),
});

const OrderDailyMenuItem = z.object({
  kind: z.literal("daily_menu"),
  daily_menu_id: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  notes: z.string().max(200).optional(),
  selected_choices: z.array(OrderSelectedChoice).default([]),
});

export const OrderItemInput = z.union([OrderProductItem, OrderDailyMenuItem]);
export type OrderItemInput = z.infer<typeof OrderItemInput>;

export const CreateOrderInput = z
  .object({
    business_slug: z.string().min(1),
    delivery_type: z.enum(["delivery", "pickup"]),
    customer_name: z.string().min(1).max(100),
    customer_phone: z.string().min(6).max(20),
    customer_email: z
      .string()
      .email("Email inválido.")
      .max(200)
      .optional(),
    delivery_address: z.string().max(200).optional(),
    delivery_notes: z.string().max(500).optional(),
    payment_method: z.enum(["cash", "mp"]).optional(),
    /**
     * Optional promo code typed by the customer in checkout. The DB lookup
     * is case-insensitive — we don't normalize here. Empty strings are
     * treated as "no code" by persist-order.
     */
    promo_code: z.string().trim().max(40).optional(),
    items: z.array(OrderItemInput).min(1),
  })
  .superRefine((data, ctx) => {
    if (data.delivery_type === "delivery" && !data.delivery_address) {
      ctx.addIssue({
        code: "custom",
        message: "Ingresá una dirección de entrega.",
        path: ["delivery_address"],
      });
    }
  });

export type CreateOrderInput = z.infer<typeof CreateOrderInput>;
