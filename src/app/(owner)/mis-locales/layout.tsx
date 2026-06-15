import { redirect } from "next/navigation";

import { getMyAdminBusinesses } from "@/lib/platform/queries";

// "Mis locales" es la vista cross-negocio del dueño multi-local. Acceso solo si
// el usuario es `admin` de ≥2 locales (su "grupo" derivado; ver spec 14 §0).
// Con un solo local va a su panel; sin locales, al login.
export default async function MisLocalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locales = await getMyAdminBusinesses();
  if (locales.length === 0) redirect("/login");
  if (locales.length === 1) redirect(`/${locales[0]!.slug}/admin`);

  return <div className="min-h-screen bg-zinc-100/60">{children}</div>;
}
