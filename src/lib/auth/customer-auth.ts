"use server";

import { redirect } from "next/navigation";

import { actionError, type ActionResult } from "@/lib/actions";
import {
  safeNextPath,
  SignInCustomerInput,
  SignUpCustomerInput,
} from "@/lib/auth/customer-auth-shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// ─────────────────────────────────────────────────────────────────────
// SPEC 25 (PENDING) — Verificación por WhatsApp DESACTIVADA.
// Los imports y las actions de verificación quedan comentados hasta aprobar
// el template "authentication" en Meta y reactivar el flujo. Ver más abajo.
// import { actionOk } from "@/lib/actions";
// import { requestPhoneCode, verifyPhoneCode } from "@/lib/auth/phone-verification";
// import { getBusiness } from "@/lib/tenant";
// ─────────────────────────────────────────────────────────────────────

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

  // ─── SPEC 25 (PENDING) — disparo de verificación por WhatsApp, desactivado ───
  // Cuando se reactive: tras el alta, encolar el código y redirigir al paso de
  // verificación si se envió; degradar a /menu si el negocio no tiene WhatsApp.
  //
  // const safeNext = safeNextPath(next, business_slug);
  // const business = await getBusiness(business_slug);
  // if (business) {
  //   const sentResult = await requestPhoneCode({
  //     userId: data.user!.id,
  //     businessId: business.id,
  //     phone,
  //   });
  //   if (sentResult.sent) {
  //     redirect(
  //       `/${business_slug}/verificar?next=${encodeURIComponent(safeNext)}`,
  //     );
  //   }
  // }
  // redirect(safeNext);
  // ─────────────────────────────────────────────────────────────────────────

  redirect(safeNextPath(next, business_slug));
}

// ═══════════════════════════════════════════════════════════════════════
// SPEC 25 (PENDING) — Actions de verificación de código por WhatsApp.
// Desactivadas hasta aprobar el template "authentication" en Meta. Preservadas
// (comentadas) para reactivar el flujo sin reescribirlo.
// ═══════════════════════════════════════════════════════════════════════
//
// export const VerifyPhoneCodeInput = z.object({
//   business_slug: z.string().min(1),
//   code: z
//     .string()
//     .transform((v) => v.replace(/\D/g, ""))
//     .refine((v) => v.length === 6, "Ingresá los 6 dígitos del código."),
//   next: z.string().optional(),
// });
//
// const VERIFY_ERRORS: Record<string, string> = {
//   mismatch: "Código incorrecto.",
//   expired: "El código expiró, pedí uno nuevo.",
//   no_code: "El código expiró, pedí uno nuevo.",
//   max_attempts: "Demasiados intentos. Pedí un código nuevo.",
//   consumed: "Ese código ya se usó. Pedí uno nuevo.",
// };
//
// export async function verifyPhoneCodeAction(
//   input: unknown,
// ): Promise<ActionResult<never>> {
//   const parsed = VerifyPhoneCodeInput.safeParse(input);
//   if (!parsed.success)
//     return actionError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
//
//   const { business_slug, code, next } = parsed.data;
//   const supabase = await createSupabaseServerClient();
//   const {
//     data: { user },
//   } = await supabase.auth.getUser();
//   if (!user) return actionError("Tu sesión expiró. Ingresá de nuevo.");
//
//   const result = await verifyPhoneCode({ userId: user.id, code });
//   if (!result.ok) {
//     return actionError(
//       VERIFY_ERRORS[result.reason] ??
//         "No pudimos verificar el código, probá de nuevo.",
//     );
//   }
//
//   redirect(safeNextPath(next, business_slug));
// }
//
// export const ResendPhoneCodeInput = z.object({
//   business_slug: z.string().min(1),
// });
//
// export async function resendPhoneCodeAction(
//   input: unknown,
// ): Promise<ActionResult<null>> {
//   const parsed = ResendPhoneCodeInput.safeParse(input);
//   if (!parsed.success) return actionError("Datos inválidos.");
//
//   const { business_slug } = parsed.data;
//   const supabase = await createSupabaseServerClient();
//   const {
//     data: { user },
//   } = await supabase.auth.getUser();
//   if (!user) return actionError("Tu sesión expiró. Ingresá de nuevo.");
//
//   const phone = (user.user_metadata?.phone as string | undefined) ?? "";
//   if (!phone) return actionError("No encontramos tu teléfono. Ingresá de nuevo.");
//
//   const business = await getBusiness(business_slug);
//   if (!business) return actionError("Negocio no encontrado.");
//
//   const result = await requestPhoneCode({
//     userId: user.id,
//     businessId: business.id,
//     phone,
//   });
//
//   if (!result.sent) {
//     return actionError(
//       result.reason === "rate_limited"
//         ? "Esperá un momento antes de pedir otro código."
//         : "La verificación no está disponible por ahora.",
//     );
//   }
//
//   return actionOk(null);
// }
