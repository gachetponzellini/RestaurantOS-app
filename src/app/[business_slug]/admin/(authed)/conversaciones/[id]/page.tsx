import { notFound, redirect } from "next/navigation";

import { ConversationDetailView } from "@/components/admin/conversations/conversation-detail-view";
import { ensureAdminAccess } from "@/lib/admin/context";
import { getConversationForInbox } from "@/lib/chatbot/inbox-query";
import { sectionAccess } from "@/lib/permissions/sections";
import { getBusiness } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function ConversacionDetailPage({
  params,
}: {
  params: Promise<{ business_slug: string; id: string }>;
}) {
  const { business_slug, id } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  const ctx = await ensureAdminAccess(business.id, business_slug);
  const access = sectionAccess("conversaciones", ctx.role, {
    isPlatformAdmin: ctx.isPlatformAdmin,
  });
  if (access === "none") redirect(`/${business_slug}/admin`);

  const detail = await getConversationForInbox(business.id, id);
  if (!detail) notFound();

  return (
    <ConversationDetailView
      slug={business_slug}
      timezone={business.timezone}
      detail={detail}
      currentUserName={ctx.userName ?? null}
    />
  );
}
