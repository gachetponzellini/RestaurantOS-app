import { notFound } from "next/navigation";

import { CustomerChatbotView } from "@/components/admin/customers/customer-chatbot-view";
import { ensureAdminAccess } from "@/lib/admin/context";
import {
  getCustomerChatbotConversation,
  getCustomerDetail,
} from "@/lib/admin/customers-query";
import { getBusiness } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function CustomerChatbotPage({
  params,
}: {
  params: Promise<{ business_slug: string; id: string }>;
}) {
  const { business_slug, id } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();
  await ensureAdminAccess(business.id, business_slug);

  const customer = await getCustomerDetail(business.id, id);
  if (!customer) notFound();

  const conversation = await getCustomerChatbotConversation(
    business.id,
    customer.phone,
  );

  return (
    <CustomerChatbotView
      slug={business_slug}
      timezone={business.timezone}
      businessName={business.name}
      businessLogoUrl={business.logo_url ?? null}
      customerId={customer.id}
      customerName={customer.name}
      customerPhone={customer.phone}
      conversation={conversation}
    />
  );
}
