import { notFound, redirect } from "next/navigation";

import { CheckoutForm } from "@/components/checkout/checkout-form";
import { VerifyAccountBanner } from "@/components/public/verify-account-banner";
import { listUserAddresses } from "@/lib/customers/addresses";
import { getCustomerProfile } from "@/lib/customers/profile";
import { getAssignedCoupon } from "@/lib/promos/assigned-coupon";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getBusiness } from "@/lib/tenant";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const next = encodeURIComponent(`/${business_slug}/checkout`);
    redirect(`/${business_slug}/login?next=${next}`);
  }

  const [savedAddresses, profile] = await Promise.all([
    listUserAddresses(user.id, business.id),
    getCustomerProfile(user.id, business.id),
  ]);

  const mpEnabled = Boolean(
    business.mp_accepts_payments && business.mp_access_token,
  );

  const assignedCoupon = await getAssignedCoupon(
    user.id,
    business.id,
    0,
    Number(business.delivery_fee_cents),
  );

  // Prefer the customer row (set on previous orders) over session metadata —
  // the customer row reflects the last name/phone the user actually typed.
  const initialName =
    profile.name ??
    (user.user_metadata?.full_name as string | undefined) ??
    (user.user_metadata?.name as string | undefined) ??
    "";
  const initialEmail = profile.email ?? user.email ?? "";
  const initialPhone =
    profile.phone ??
    (user.phone as string | undefined) ??
    (user.user_metadata?.phone as string | undefined) ??
    "";

  const showVerifyBanner = user.user_metadata?.phone_verified !== true;

  return (
    <>
      {showVerifyBanner && (
        <VerifyAccountBanner
          href={`/${business_slug}/verificar?next=${encodeURIComponent(
            `/${business_slug}/checkout`,
          )}`}
        />
      )}
      <CheckoutForm
        slug={business_slug}
        businessName={business.name}
        businessAddress={business.address}
        deliveryFeeCents={Number(business.delivery_fee_cents)}
        estimatedMinutes={business.estimated_delivery_minutes}
        savedAddresses={savedAddresses}
        mpEnabled={mpEnabled}
        initialName={initialName}
        initialEmail={initialEmail}
        initialPhone={initialPhone}
        initialPromo={
          assignedCoupon
            ? {
                code: assignedCoupon.code,
                discount_cents: assignedCoupon.discount_cents,
                free_shipping: assignedCoupon.free_shipping,
              }
            : undefined
        }
      />
    </>
  );
}
