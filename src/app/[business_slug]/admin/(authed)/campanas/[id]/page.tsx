import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { CampaignDetailView } from "@/components/admin/campaigns/campaign-detail";
import { PageShell } from "@/components/admin/shell/page-shell";
import { ensureAdminAccess } from "@/lib/admin/context";
import {
  getCampaign,
  getCampaignRedemptionAmount,
  listCampaignMessages,
  resolveAudience,
} from "@/lib/admin/campaigns-query";
import { getBusiness } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ business_slug: string; id: string }>;
}) {
  const { business_slug, id } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();
  await ensureAdminAccess(business.id, business_slug);

  const campaign = await getCampaign(business.id, id);
  if (!campaign) notFound();

  const isDraft = campaign.status === "draft";
  const [messages, audiencePreview, redemptionAmountCents] = await Promise.all([
    isDraft ? Promise.resolve([]) : listCampaignMessages(campaign.id),
    isDraft
      ? resolveAudience(business.id, {
          type: campaign.audience_type,
          segment: campaign.audience_segment,
          customer_ids: campaign.audience_customer_ids,
        })
      : Promise.resolve([]),
    isDraft
      ? Promise.resolve(0)
      : getCampaignRedemptionAmount(campaign.id),
  ]);

  return (
    <PageShell width="wide" className="space-y-6">
      <div>
        <Link
          href={`/${business_slug}/admin/campanas`}
          className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeft className="size-3.5" /> Volver
        </Link>
      </div>

      <CampaignDetailView
        slug={business_slug}
        businessName={business.name}
        campaign={campaign}
        messages={messages}
        audiencePreview={audiencePreview}
        redemptionAmountCents={redemptionAmountCents}
      />
    </PageShell>
  );
}
