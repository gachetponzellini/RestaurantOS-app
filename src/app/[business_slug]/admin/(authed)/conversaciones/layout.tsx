import { notFound, redirect } from "next/navigation";

import { InboxShell } from "@/components/admin/conversations/inbox-shell";
import { ensureAdminAccess } from "@/lib/admin/context";
import { listConversations } from "@/lib/chatbot/inbox-query";
import { sectionAccess } from "@/lib/permissions/sections";
import { getBusiness } from "@/lib/tenant";

export const dynamic = "force-dynamic";

// Layout master-detail de la bandeja (spec 32): la lista vive acá y persiste
// entre la página vacía y el detalle [id]. Gate por sección "conversaciones"
// (admin/encargado). La lista se baja por service client (tablas chatbot_*
// service-role-only) y refresca por polling desde el InboxShell.
export default async function ConversacionesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  const ctx = await ensureAdminAccess(business.id, business_slug);
  const access = sectionAccess("conversaciones", ctx.role, {
    isPlatformAdmin: ctx.isPlatformAdmin,
  });
  if (access === "none") redirect(`/${business_slug}/admin`);

  const conversations = await listConversations(business.id);

  return (
    <InboxShell
      slug={business_slug}
      timezone={business.timezone}
      conversations={conversations}
    >
      {children}
    </InboxShell>
  );
}
