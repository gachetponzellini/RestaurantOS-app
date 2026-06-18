"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { actionError, type ActionResult } from "@/lib/actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

export async function signInCustomer(
  input: unknown,
): Promise<ActionResult<never>> {
  const parsed = SignInCustomerInput.safeParse(input);
  if (!parsed.success)
    return actionError(parsed.error.issues[0]?.message ?? "Datos inválidos.");

  const { business_slug, email, password, next } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return actionError("Email o contraseña incorrectos.");

  redirect(safeNextPath(next, business_slug));
}

export async function signUpCustomer(
  input: unknown,
): Promise<ActionResult<never>> {
  const parsed = SignUpCustomerInput.safeParse(input);
  if (!parsed.success)
    return actionError(parsed.error.issues[0]?.message ?? "Datos inválidos.");

  const { business_slug, email, password, phone, next } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { phone } },
  });

  if (error) {
    return actionError("No pudimos completar la operación, probá de nuevo.");
  }

  // Confirm email OFF: existing email returns user with empty identities and no session.
  if (!data.session) {
    return actionError("Ya existe una cuenta con ese email. Probá ingresar.");
  }

  redirect(safeNextPath(next, business_slug));
}
