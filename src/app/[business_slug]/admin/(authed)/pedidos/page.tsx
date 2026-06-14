import { redirect } from "next/navigation";

export default async function AdminOrdersRedirect({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  redirect(`/${business_slug}/admin/operacion`);
}

export const dynamic = "force-dynamic";
