import { z } from "zod";

/**
 * Pedido flash (spec 09): orden de un único renglón por monto y concepto
 * libre, para facturar un evento sin desglose de productos (ej: "Lunch torneo
 * Banco Macro"). El monto va en centavos; el concepto no puede ser vacío.
 *
 * Vive en su propio módulo (sin "use server") para poder testear la validación
 * sin tocar la DB y para reusarla desde el action.
 */
export const pedidoFlashSchema = z.object({
  concepto: z
    .string()
    .trim()
    .min(1, "El concepto del pedido flash es obligatorio."),
  montoCents: z
    .number()
    .int("El monto debe expresarse en centavos (entero).")
    .positive("El monto debe ser mayor a 0."),
});

export type PedidoFlashInput = z.infer<typeof pedidoFlashSchema>;
