import { redirect } from "next/navigation";

import { SuperSidebar } from "@/components/super/super-sidebar";
import {
  ensurePlatformAdmin,
  getMyAdminBusinesses,
} from "@/lib/platform/queries";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await ensurePlatformAdmin();
  if (!admin) {
    // No es platform admin: si es dueño de varios locales, su home es "Mis
    // locales"; si tiene uno, su panel; si ninguno, login. (spec 14)
    const mine = await getMyAdminBusinesses();
    if (mine.length >= 2) redirect("/mis-locales");
    if (mine.length === 1) redirect(`/${mine[0]!.slug}/admin`);
    redirect("/login");
  }

  const userName =
    (admin.user.user_metadata?.full_name as string | undefined) ??
    (admin.user.user_metadata?.name as string | undefined);

  return (
    <div className="min-h-screen bg-zinc-100/60 lg:flex">
      <SuperSidebar userEmail={admin.email} userName={userName} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
