"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { requestPhoneCode, verifyPhoneCode } from "@/lib/auth/phone-verification";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBusiness } from "@/lib/tenant";

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
  if (!data.session || !data.user) {
    return actionError("Ya existe una cuenta con ese email. Probá ingresar.");
  }

  const safeNext = safeNextPath(next, business_slug);

  // Spec 25: disparar la verificación por WhatsApp (best-effort). Si se envió un
  // código, mandamos al paso de verificación; si el negocio no tiene WhatsApp o
  // se topó el rate-limit, la cuenta queda sin verificar (degradación, D5) y
  // seguimos como en el spec 24.
  const business = await getBusiness(business_slug);
  if (business) {
    const sentResult = await requestPhoneCode({
      userId: data.user.id,
      businessId: business.id,
      phone,
    });
    if (sentResult.sent) {
      redirect(
        `/${business_slug}/verificar?next=${encodeURIComponent(safeNext)}`,
      );
    }
  }

  redirect(safeNext);
}

export const VerifyPhoneCodeInput = z.object({
  business_slug: z.string().min(1),
  code: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length === 6, "Ingresá los 6 dígitos del código."),
  next: z.string().optional(),
});

const VERIFY_ERRORS: Record<string, string> = {
  mismatch: "Código incorrecto.",
  expired: "El código expiró, pedí uno nuevo.",
  no_code: "El código expiró, pedí uno nuevo.",
  max_attempts: "Demasiados intentos. Pedí un código nuevo.",
  consumed: "Ese código ya se usó. Pedí uno nuevo.",
};

export async function verifyPhoneCodeAction(
  input: unknown,
): Promise<ActionResult<never>> {
  const parsed = VerifyPhoneCodeInput.safeParse(input);
  if (!parsed.success)
    return actionError(parsed.error.issues[0]?.message ?? "Datos inválidos.");

  const { business_slug, code, next } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return actionError("Tu sesión expiró. Ingresá de nuevo.");

  const result = await verifyPhoneCode({ userId: user.id, code });
  if (!result.ok) {
    return actionError(
      VERIFY_ERRORS[result.reason] ??
        "No pudimos verificar el código, probá de nuevo.",
    );
  }

  redirect(safeNextPath(next, business_slug));
}

export const ResendPhoneCodeInput = z.object({
  business_slug: z.string().min(1),
});

export async function resendPhoneCodeAction(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = ResendPhoneCodeInput.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");

  const { business_slug } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return actionError("Tu sesión expiró. Ingresá de nuevo.");

  const phone = (user.user_metadata?.phone as string | undefined) ?? "";
  if (!phone) return actionError("No encontramos tu teléfono. Ingresá de nuevo.");

  const business = await getBusiness(business_slug);
  if (!business) return actionError("Negocio no encontrado.");

  const result = await requestPhoneCode({
    userId: user.id,
    businessId: business.id,
    phone,
  });

  if (!result.sent) {
    return actionError(
      result.reason === "rate_limited"
        ? "Esperá un momento antes de pedir otro código."
        : "La verificación no está disponible por ahora.",
    );
  }

  return actionOk(null);
}
