"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  NotificationsBell,
  NotificationsDrawer,
} from "@/components/notifications/notifications-drawer";
import { NotificationsToastHost } from "@/components/notifications/notifications-toast-host";
import { useNotificationsRealtime } from "@/components/notifications/use-notifications-realtime";
import { markAllRead, markRead } from "@/lib/notifications/actions";
import type { Notification } from "@/lib/notifications/queries";

/**
 * Mount global: campana + drawer + toasts iOS.
 *
 * El hook `useNotificationsRealtime` mantiene la lista en cliente, dispara
 * toasts ante INSERTs y expone un helper para marcar leído localmente
 * (optimistic UI; el server reconcilia vía revalidatePath).
 */
export function NotificationsLauncher({
  notifications: initialNotifications,
  unreadCount: initialUnreadCount,
  businessSlug,
  businessId,
  userId,
  role,
  variant = "default",
  fixed = false,
}: {
  notifications: Notification[];
  unreadCount: number;
  businessSlug: string;
  businessId: string;
  userId: string;
  role: string;
  variant?: "default" | "ghost";
  /** Si true, el bell se posiciona fixed top-right (z-50, encima del
   *  overlay del LocalShell y de cualquier header de página). */
  fixed?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { notifications, unreadCount, markAllReadLocally } =
    useNotificationsRealtime({
      initialNotifications,
      initialUnreadCount,
      businessId,
      userId,
      role,
    });

  const markOne = async (n: Notification) => {
    if (n.read_at) return;
    // Server: revalidatePath fuerza al hook a re-syncear desde el snapshot.
    await markRead(n.id, businessSlug);
  };

  const markAll = async () => {
    // Optimistic local update; el server reconcilia vía revalidatePath.
    markAllReadLocally();
    await markAllRead(businessSlug);
  };

  const handleItemClick = async (n: Notification) => {
    await markOne(n);
    setOpen(false);
    // Deep-link según tipo. Mantener sincronizado con `viewForNotification`.
    if (n.type === "order.pending") {
      router.push(`/${businessSlug}/admin/operacion?tab=pedidos`);
      return;
    }
    router.refresh();
  };

  const handleToastClick = (n: Notification) => {
    void markOne(n);
    if (n.type === "order.pending") {
      router.push(`/${businessSlug}/admin/operacion?tab=pedidos`);
      return;
    }
    setOpen(true);
  };

  return (
    <>
      {fixed ? (
        <div className="fixed right-4 top-3 z-50">
          <NotificationsBell
            unreadCount={unreadCount}
            variant={variant}
            onClick={() => setOpen(true)}
          />
        </div>
      ) : (
        <NotificationsBell
          unreadCount={unreadCount}
          variant={variant}
          onClick={() => setOpen(true)}
        />
      )}
      <NotificationsDrawer
        open={open}
        onOpenChange={setOpen}
        notifications={notifications}
        onItemClick={handleItemClick}
        onMarkAllRead={markAll}
      />
      <NotificationsToastHost onToastClick={handleToastClick} />
    </>
  );
}
