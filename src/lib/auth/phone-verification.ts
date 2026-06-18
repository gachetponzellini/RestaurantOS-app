// ════════════════════════════════════
// SPEC 25 (PENDING) — Lógica de verificación por WhatsApp DESACTIVADA.
// Código preservado (comentado). Reactivar al aprobar el template Meta.
// ════════════════════════════════════

// import "server-only";
//
// import { createHash, randomInt } from "node:crypto";
// import type { SupabaseClient } from "@supabase/supabase-js";
//
// import { enqueueWhatsapp } from "@/lib/notifications/whatsapp-outbox";
// import { isWhatsappConnected } from "@/lib/notifications/whatsapp-sender";
// import { limitPhoneVerificationSend } from "@/lib/rate-limit";
// import { createSupabaseServiceClient } from "@/lib/supabase/service";
//
// /**
//  * Verificación del teléfono del cliente por código de WhatsApp (spec 25).
//  *
//  * Generamos y validamos el código nosotros (no el OTP nativo de Supabase, que
//  * usa su proveedor SMS) para mandarlo por NUESTRO WhatsApp (360dialog, creds
//  * por negocio). Persistimos sólo el HASH del código; el claro vive en memoria
//  * y en el mensaje de WhatsApp, nunca en la DB ni en logs.
//  */
//
// export const CODE_LENGTH = 6;
// export const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutos
// export const MAX_ATTEMPTS = 5;
//
// // Template "authentication" aprobado por Meta (dependencia operativa). El código
// // va como parámetro posicional del body. Override por env por si cambia el nombre.
// const TEMPLATE_NAME =
//   process.env.PHONE_VERIFICATION_TEMPLATE_NAME ?? "verificacion_cuenta";
// const TEMPLATE_LANG =
//   process.env.PHONE_VERIFICATION_TEMPLATE_LANG ?? "es_AR";
//
// // ─────────────────────────────────────────────────────────────────────
// // Lógica pura (testeable sin red)
// // ─────────────────────────────────────────────────────────────────────
//
// /** Código numérico de 6 dígitos, cripto-aleatorio (con ceros a la izquierda). */
// export function generatePhoneCode(): string {
//   return randomInt(0, 10 ** CODE_LENGTH)
//     .toString()
//     .padStart(CODE_LENGTH, "0");
// }
//
// /**
//  * Hash del código con un pepper de env (server-only). Esto es lo que se guarda,
//  * nunca el código en claro. `sha256(code:pepper)` en hex.
//  */
// export function hashPhoneCode(code: string): string {
//   const pepper = process.env.PHONE_VERIFICATION_PEPPER ?? "";
//   return createHash("sha256").update(`${code}:${pepper}`).digest("hex");
// }
//
// export type CodeRecord = {
//   code_hash: string;
//   expires_at: string;
//   attempts: number;
//   consumed_at: string | null;
// };
//
// export type CodeVerdict =
//   | "ok"
//   | "mismatch"
//   | "expired"
//   | "consumed"
//   | "max_attempts";
//
// /** Evalúa un código candidato contra el registro guardado. Sin efectos. */
// export function evaluatePhoneCode(
//   record: CodeRecord,
//   candidate: string,
//   nowMs: number,
// ): CodeVerdict {
//   if (record.consumed_at) return "consumed";
//   if (record.attempts >= MAX_ATTEMPTS) return "max_attempts";
//   if (nowMs > new Date(record.expires_at).getTime()) return "expired";
//   if (hashPhoneCode(candidate) !== record.code_hash) return "mismatch";
//   return "ok";
// }
//
// // ─────────────────────────────────────────────────────────────────────
// // Orquestación server (rate-limit + DB + envío)
// // ─────────────────────────────────────────────────────────────────────
//
// export type RequestCodeResult =
//   | { sent: true }
//   | { sent: false; reason: "whatsapp_unavailable" | "rate_limited" };
//
// /**
//  * Genera un código, guarda su hash (invalidando el anterior) y lo encola por
//  * WhatsApp con las credenciales del negocio. Degradación (design D5): si el
//  * negocio no tiene WhatsApp, es no-op y la cuenta queda sin verificar (estado
//  * equivalente al spec 24), sin romper el alta.
//  */
// export async function requestPhoneCode(params: {
//   userId: string;
//   businessId: string;
//   phone: string;
// }): Promise<RequestCodeResult> {
//   const { userId, businessId, phone } = params;
//
//   // Rate-limit por identidad del usuario (cooldown + techo horario).
//   const limit = await limitPhoneVerificationSend(userId);
//   if (!limit.success) return { sent: false, reason: "rate_limited" };
//
//   // Degradación: negocio sin 360dialog → no-op.
//   if (!(await isWhatsappConnected(businessId))) {
//     return { sent: false, reason: "whatsapp_unavailable" };
//   }
//
//   const code = generatePhoneCode();
//   const service = createSupabaseServiceClient() as unknown as SupabaseClient;
//
//   // Un código vigente por vez: consumimos los anteriores no usados del usuario.
//   await service
//     .from("phone_verification_codes")
//     .update({ consumed_at: new Date().toISOString() })
//     .eq("user_id", userId)
//     .is("consumed_at", null);
//
//   await service.from("phone_verification_codes").insert({
//     user_id: userId,
//     business_id: businessId,
//     phone,
//     code_hash: hashPhoneCode(code),
//     expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
//   });
//
//   // El código viaja SÓLO en los params del template (hacia Meta). El `body` que
//   // persiste el outbox es genérico: nunca guardamos ni logueamos el código.
//   await enqueueWhatsapp({
//     businessId,
//     toPhone: phone,
//     body: "Código de verificación de cuenta enviado por WhatsApp.",
//     kind: "notification",
//     template: { name: TEMPLATE_NAME, lang: TEMPLATE_LANG, params: [code] },
//   });
//
//   return { sent: true };
// }
//
// export type VerifyCodeResult =
//   | { ok: true }
//   | { ok: false; reason: CodeVerdict | "no_code" };
//
// /**
//  * Valida el código activo del usuario. Si coincide: lo marca consumido y setea
//  * `user_metadata.phone_verified = true` + timestamp vía admin API. Si no
//  * coincide: incrementa intentos. Expirado / consumido / sin código → falla.
//  */
// export async function verifyPhoneCode(params: {
//   userId: string;
//   code: string;
// }): Promise<VerifyCodeResult> {
//   const { userId, code } = params;
//   const service = createSupabaseServiceClient() as unknown as SupabaseClient;
//
//   const { data: record } = await service
//     .from("phone_verification_codes")
//     .select("id, code_hash, expires_at, attempts, consumed_at")
//     .eq("user_id", userId)
//     .is("consumed_at", null)
//     .order("created_at", { ascending: false })
//     .limit(1)
//     .maybeSingle();
//
//   if (!record) return { ok: false, reason: "no_code" };
//
//   const verdict = evaluatePhoneCode(record, code, Date.now());
//
//   if (verdict === "mismatch") {
//     await service
//       .from("phone_verification_codes")
//       .update({ attempts: record.attempts + 1 })
//       .eq("id", record.id);
//     return { ok: false, reason: "mismatch" };
//   }
//
//   if (verdict !== "ok") return { ok: false, reason: verdict };
//
//   const nowIso = new Date().toISOString();
//   await service
//     .from("phone_verification_codes")
//     .update({ consumed_at: nowIso })
//     .eq("id", record.id);
//
//   // La marca de verificado es del USUARIO (global), no del customer per-negocio.
//   const { data: userData } = await service.auth.admin.getUserById(userId);
//   await service.auth.admin.updateUserById(userId, {
//     user_metadata: {
//       ...(userData?.user?.user_metadata ?? {}),
//       phone_verified: true,
//       phone_verified_at: nowIso,
//     },
//   });
//
//   return { ok: true };
// }
//
