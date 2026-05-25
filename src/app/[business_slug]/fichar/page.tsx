import { notFound } from "next/navigation";

import { getBusiness } from "@/lib/tenant";
import { getCurrentPresent } from "@/lib/rrhh/clock-actions";

import { ClockScreen } from "@/components/fichar/clock-screen";

export const dynamic = "force-dynamic";

export default async function FicharPage({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  const present = await getCurrentPresent(business_slug);

  return <ClockScreen slug={business_slug} initialPresent={present} />;
}
