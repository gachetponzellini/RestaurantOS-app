import { notFound, redirect } from "next/navigation";

import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { BrandStyle } from "@/components/admin/shell/brand-style";
import { NotificationsLauncher } from "@/components/notifications/notifications-launcher";
import { canManageBusiness, ensureAdminAccess } from "@/lib/admin/context";
import { getPendingOrderCount } from "@/lib/admin/orders-query";
import { getLowKitchenStockCount } from "@/lib/ingredients/queries";
import { countUnread, listForUser } from "@/lib/notifications/queries";
import { getLowStockCount } from "@/lib/stock/queries";
import { getBusiness, getBusinessSettings } from "@/lib/tenant";

export default async function AdminAuthedLayout({
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

  // Hard gate: el mozo NO entra al panel admin. Su superficie es /mozo
  // (Mis mesas). Cubre todas las páginas bajo /admin/(authed)/* con un
  // único redirect — más simple que repetirlo en cada page. El platform
  // admin pasa siempre, aunque no tenga rol asignado.
  if (!ctx.isPlatformAdmin && ctx.role === "mozo") {
    redirect(`/${business_slug}/mozo`);
  }

  const [pendingCount, lowBebidasCount, lowCocinaCount] = await Promise.all([
    getPendingOrderCount(business.id, business.timezone),
    getLowStockCount(business.id),
    getLowKitchenStockCount(business.id),
  ]);
  // El badge de "Productos e inventario" suma faltantes de bebidas + cocina,
  // ya que ambos stocks ahora viven en la misma sección.
  const lowStockCount = lowBebidasCount + lowCocinaCount;
  const settings = getBusinessSettings(business);

  // Notificaciones globales para el layout admin. Para platform admin sin
  // membership usamos "admin" como rol nominal para la suscripción —
  // visualmente el bell + mocks de fallback se renderizan igual.
  const notiRole = ctx.role ?? "admin";
  const [notifications, unreadCount] = await Promise.all([
    listForUser({
      userId: ctx.user.id,
      businessId: business.id,
      role: notiRole,
      limit: 20,
    }),
    countUnread({
      userId: ctx.user.id,
      businessId: business.id,
      role: notiRole,
    }),
  ]);

  return (
    <div
      data-admin-brand
      className="flex min-h-screen bg-zinc-100/60"
    >
      <BrandStyle
        primary={settings.primary_color}
        primaryForeground={settings.primary_foreground}
      />
      <AdminSidebar
        slug={business_slug}
        businessId={business.id}
        businessName={business.name}
        businessLogoUrl={business.logo_url}
        userEmail={ctx.userEmail}
        userName={ctx.userName}
        isPlatformAdmin={ctx.isPlatformAdmin}
        canManageBusiness={canManageBusiness(ctx)}
        initialPendingCount={pendingCount}
        lowStockCount={lowStockCount}
        isActive={business.is_active ?? true}
      />
      <div className="min-w-0 flex-1">{children}</div>

      {/* Bell fixed top-right — visible en todas las pantallas admin,
          z-50 queda por encima del overlay del LocalShell (z-30) y de los
          page headers. Sheets/dialogs portados pueden subir por encima. */}
      <NotificationsLauncher
        notifications={notifications}
        unreadCount={unreadCount}
        businessSlug={business_slug}
        businessId={business.id}
        userId={ctx.user.id}
        role={notiRole}
        fixed
      />
    </div>
  );
}
