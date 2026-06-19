import { z } from "zod";

// Helpers y schemas compartidos del login de cliente. Viven fuera de
// `customer-auth.ts` porque ese archivo es `"use server"` y un módulo de
// Server Actions solo puede exportar funciones async — no helpers sync ni
// schemas. Acá se pueden importar tanto del server como de tests/cliente.

export function safeNextPath(next: string | undefined, slug: string): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return `/${slug}/menu`;
}

export const SignInCustomerInput = z.object({
  business_slug: z.string().min(1),
  email: z.string().email("Ingresá un email válido."),
  password: z.string().min(1, "Ingresá tu contraseña."),
  next: z.string().optional(),
});

export const SignUpCustomerInput = z.object({
  business_slug: z.string().min(1),
  email: z.string().email("Ingresá un email válido."),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres."),
  phone: z
    .string()
    .min(1, "Ingresá un teléfono válido.")
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 8, "Ingresá un teléfono válido."),
  next: z.string().optional(),
});
