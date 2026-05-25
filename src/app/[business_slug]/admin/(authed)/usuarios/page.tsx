import { redirect } from "next/navigation";

export default async function UsuariosRedirectPage({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  redirect(`/${business_slug}/admin/rrhh?tab=equipo`);
}
