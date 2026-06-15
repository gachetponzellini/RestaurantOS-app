import { notFound, redirect } from "next/navigation";

import { ChatbotPanel } from "@/components/admin/chatbot-panel";
import { ensureAdminAccess } from "@/lib/admin/context";
import { sectionAccess } from "@/lib/permissions/sections";
import { getBusiness } from "@/lib/tenant";

export default async function ChatbotPage({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  // Admin = sección completa (prompt + tester + toggle). Encargado = solo el
  // on/off del bot ("limited"). Mozo/personal = sin acceso. Ver sections.ts.
  const ctx = await ensureAdminAccess(business.id, business_slug);
  const access = sectionAccess("chatbot", ctx.role, {
    isPlatformAdmin: ctx.isPlatformAdmin,
  });
  if (access === "none") redirect(`/${business_slug}/admin`);

  return (
    <div className="flex h-screen flex-col px-6 py-8 lg:px-10 lg:py-10">
      <ChatbotPanel
        businessSlug={business_slug}
        businessName={business.name}
        access={access}
      />
    </div>
  );
}
