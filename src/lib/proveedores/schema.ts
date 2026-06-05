import { z } from "zod";

export const SupplierInput = z.object({
  name: z.string().min(1, "Requerido.").max(100),
  cuit: z.string().max(13).nullable().optional(),
  contact: z.string().max(100).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
  email: z
    .string()
    .email("Email inválido.")
    .max(100)
    .nullable()
    .optional()
    .or(z.literal("")),
  notes: z.string().max(500).nullable().optional(),
  is_active: z.boolean(),
});
export type SupplierInput = z.infer<typeof SupplierInput>;

export const SupplierInvoiceInput = z.object({
  supplier_id: z.string().uuid("Proveedor inválido."),
  invoice_number: z.string().max(50).nullable().optional(),
  invoice_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  total_cents: z.number().int().min(0, "No puede ser negativo."),
  photo_url: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type SupplierInvoiceInput = z.infer<typeof SupplierInvoiceInput>;

export const ImportSupplierRow = z.object({
  name: z.string().min(1, "Nombre requerido.").max(100),
  cuit: z.string().max(13).optional(),
  contact: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().email("Email inválido.").max(100).optional().or(z.literal("")),
});
export type ImportSupplierRow = z.infer<typeof ImportSupplierRow>;

export const ImportSupplierBatch = z
  .array(ImportSupplierRow)
  .min(1, "Al menos una fila.")
  .max(500, "Máximo 500 filas por lote.");
export type ImportSupplierBatch = z.infer<typeof ImportSupplierBatch>;
