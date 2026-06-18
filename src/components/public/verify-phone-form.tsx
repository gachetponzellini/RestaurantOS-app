// ════════════════════════════════════
// SPEC 25 (PENDING) — Form de verificación (input 6 dígitos) DESACTIVADO.
// Código preservado (comentado). Reactivar al aprobar el template Meta.
// ════════════════════════════════════

// "use client";
//
// import Link from "next/link";
// import { useEffect, useState } from "react";
// import { toast } from "sonner";
//
// import {
//   resendPhoneCodeAction,
//   verifyPhoneCodeAction,
// } from "@/lib/auth/customer-auth";
//
// const RESEND_COOLDOWN_S = 60;
//
// const inputStyle: React.CSSProperties = {
//   width: "100%",
//   height: 60,
//   borderRadius: 12,
//   border: "1px solid var(--hairline-2)",
//   background: "var(--bg)",
//   color: "var(--ink)",
//   fontSize: 28,
//   fontWeight: 600,
//   letterSpacing: 12,
//   textAlign: "center",
//   padding: "0 16px",
//   outline: "none",
//   boxSizing: "border-box",
// };
//
// interface Props {
//   business_slug: string;
//   next: string;
//   phoneMasked: string;
// }
//
// export function VerifyPhoneForm({ business_slug, next, phoneMasked }: Props) {
//   const [code, setCode] = useState("");
//   const [submitting, setSubmitting] = useState(false);
//   const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
//
//   // Cuenta regresiva del cooldown de "Reenviar código".
//   useEffect(() => {
//     if (cooldown <= 0) return;
//     const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
//     return () => clearTimeout(t);
//   }, [cooldown]);
//
//   const isRedirect = (err: unknown) =>
//     err instanceof Error &&
//     "digest" in err &&
//     typeof err.digest === "string" &&
//     err.digest.startsWith("NEXT_REDIRECT");
//
//   const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
//     e.preventDefault();
//     const digits = code.replace(/\D/g, "");
//     if (digits.length !== 6) {
//       toast.error("Ingresá los 6 dígitos del código.");
//       return;
//     }
//
//     setSubmitting(true);
//     try {
//       const result = await verifyPhoneCodeAction({
//         business_slug,
//         code: digits,
//         next,
//       });
//       // Éxito → la action redirige (throw NEXT_REDIRECT); sólo llegamos acá si falló.
//       if (result && !result.ok) toast.error(result.error);
//     } catch (err) {
//       if (isRedirect(err)) throw err;
//       console.error(err);
//       toast.error("No pudimos verificar el código, probá de nuevo.");
//     } finally {
//       setSubmitting(false);
//     }
//   };
//
//   const handleResend = async () => {
//     if (cooldown > 0) return;
//     try {
//       const result = await resendPhoneCodeAction({ business_slug });
//       if (result.ok) {
//         toast.success("Te enviamos un nuevo código por WhatsApp.");
//         setCooldown(RESEND_COOLDOWN_S);
//       } else {
//         toast.error(result.error);
//       }
//     } catch (err) {
//       console.error(err);
//       toast.error("No pudimos reenviar el código, probá de nuevo.");
//     }
//   };
//
//   return (
//     <div>
//       <div style={{ fontSize: 15, color: "var(--ink-2)", marginBottom: 20, lineHeight: 1.4 }}>
//         Te enviamos un código de 6 dígitos por WhatsApp al{" "}
//         <strong style={{ color: "var(--ink)" }}>{phoneMasked}</strong>.
//       </div>
//
//       <form onSubmit={handleSubmit} noValidate style={{ display: "grid", gap: 16 }}>
//         <input
//           id="code"
//           name="code"
//           type="text"
//           inputMode="numeric"
//           autoComplete="one-time-code"
//           autoFocus
//           maxLength={6}
//           placeholder="------"
//           value={code}
//           onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
//           style={inputStyle}
//         />
//
//         <button
//           type="submit"
//           disabled={submitting}
//           style={{
//             width: "100%",
//             height: 54,
//             borderRadius: 12,
//             background: "var(--ink)",
//             color: "var(--bg)",
//             border: "none",
//             fontSize: 15,
//             fontWeight: 600,
//             cursor: submitting ? "wait" : "pointer",
//             opacity: submitting ? 0.7 : 1,
//           }}
//         >
//           {submitting ? "Verificando…" : "Verificar"}
//         </button>
//       </form>
//
//       <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
//         <button
//           type="button"
//           onClick={handleResend}
//           disabled={cooldown > 0}
//           style={{
//             background: "none",
//             border: "none",
//             padding: 0,
//             fontSize: 13,
//             color: cooldown > 0 ? "var(--ink-3)" : "var(--ink)",
//             fontWeight: 600,
//             cursor: cooldown > 0 ? "default" : "pointer",
//           }}
//         >
//           {cooldown > 0 ? `Reenviar código (${cooldown}s)` : "Reenviar código"}
//         </button>
//
//         <Link
//           href={next}
//           style={{ fontSize: 13, color: "var(--ink-3)", textDecoration: "none" }}
//         >
//           Verificar más tarde
//         </Link>
//       </div>
//     </div>
//   );
// }
//
