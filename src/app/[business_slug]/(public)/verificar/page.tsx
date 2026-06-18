import { notFound } from "next/navigation";

// ════════════════════════════════════
// SPEC 25 (PENDING) — Paso de verificación por WhatsApp DESACTIVADO.
// La ruta /[slug]/verificar queda inerte (404) hasta aprobar el template
// "authentication" en Meta y reactivar el flujo. Implementación original
// preservada (comentada) más abajo.
// ════════════════════════════════════

export default function VerifyPhonePage() {
  notFound();
}

// import Link from "next/link";
// import { notFound, redirect } from "next/navigation";
//
// import { I } from "@/components/delivery/primitives";
// import { VerifyPhoneForm } from "@/components/public/verify-phone-form";
// import { createSupabaseServerClient } from "@/lib/supabase/server";
// import { getBusiness } from "@/lib/tenant";
//
// /** Enmascara el teléfono dejando visibles sólo los últimos 4 dígitos. */
// function maskPhone(phone: string): string {
//   const digits = phone.replace(/\D/g, "");
//   if (digits.length < 4) return "tu teléfono";
//   return `•••• ${digits.slice(-4)}`;
// }
//
// export default async function VerifyPhonePage({
//   params,
//   searchParams,
// }: {
//   params: Promise<{ business_slug: string }>;
//   searchParams: Promise<{ next?: string }>;
// }) {
//   const { business_slug } = await params;
//   const { next } = await searchParams;
//   const business = await getBusiness(business_slug);
//   if (!business) notFound();
//
//   const safeNext =
//     next && next.startsWith("/") && !next.startsWith("//")
//       ? next
//       : `/${business_slug}/menu`;
//
//   const supabase = await createSupabaseServerClient();
//   const {
//     data: { user },
//   } = await supabase.auth.getUser();
//
//   // Sin sesión → a login. Ya verificado → a destino (gate suave: no insiste).
//   if (!user) redirect(`/${business_slug}/login?next=${encodeURIComponent(safeNext)}`);
//   if (user.user_metadata?.phone_verified === true) redirect(safeNext);
//
//   const phone = (user.user_metadata?.phone as string | undefined) ?? "";
//
//   return (
//     <div
//       style={{
//         maxWidth: 520,
//         margin: "0 auto",
//         minHeight: "100vh",
//         background: "var(--bg)",
//         display: "flex",
//         flexDirection: "column",
//       }}
//     >
//       <div
//         style={{
//           paddingTop: 16,
//           paddingBottom: 8,
//           paddingLeft: 8,
//           display: "flex",
//           alignItems: "center",
//         }}
//       >
//         <Link
//           href={safeNext}
//           aria-label="Cerrar"
//           style={{
//             width: 40,
//             height: 40,
//             display: "flex",
//             alignItems: "center",
//             justifyContent: "center",
//           }}
//         >
//           {I.close("var(--ink)", 20)}
//         </Link>
//       </div>
//
//       <div
//         style={{
//           flex: 1,
//           display: "flex",
//           flexDirection: "column",
//           justifyContent: "space-between",
//           padding: "24px 28px 40px",
//         }}
//       >
//         <div style={{ marginTop: 40 }}>
//           <div
//             className="d-display"
//             style={{ fontSize: 44, lineHeight: 1.0, color: "var(--ink)" }}
//           >
//             Verificá tu cuenta
//           </div>
//           <div
//             style={{
//               fontSize: 15,
//               color: "var(--ink-2)",
//               marginTop: 12,
//               lineHeight: 1.4,
//               maxWidth: 300,
//             }}
//           >
//             Confirmá tu teléfono para asegurar tu cuenta en {business.name}.
//           </div>
//         </div>
//
//         <div>
//           <VerifyPhoneForm
//             business_slug={business_slug}
//             next={safeNext}
//             phoneMasked={maskPhone(phone)}
//           />
//         </div>
//       </div>
//     </div>
//   );
// }
//
