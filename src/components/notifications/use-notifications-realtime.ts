"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { dispatchNotificationToast } from "@/components/notifications/notifications-toast-host";
import type { BusinessRole } from "@/lib/admin/context";
import type { Notification } from "@/lib/notifications/queries";
import { visibleTargetRoles } from "@/lib/notifications/visibility";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Mantiene la lista de notificaciones en cliente, suscrito a `notifications`
 * vía Supabase realtime. Cada INSERT visible para el usuario:
 *   - se mete al tope de la lista,
 *   - dispara un toast iOS-style vía `dispatchNotificationToast`.
 *
 * No filtra del lado del canal (postgres_changes no permite OR en filter)
 * — filtramos client-side por user_id/target_role.
 */
export function useNotificationsRealtime({
  initialNotifications,
  initialUnreadCount,
  businessId,
  userId,
  role,
}: {
  initialNotifications: Notification[];
  initialUnreadCount: number;
  businessId: string;
  userId: string;
  role: string;
}) {
  const [list, setList] = useState<Notification[]>(initialNotifications);

  // Resync cuando el snapshot del server cambia (post markRead/markAllRead
  // que invocan revalidatePath). La fuente de verdad es siempre el server.
  useEffect(() => {
    setList(initialNotifications);
  }, [initialNotifications]);

  const businessIdRef = useRef(businessId);
  const userIdRef = useRef(userId);
  // Roles cuyos broadcasts ve este usuario (jerarquía; debe coincidir con
  // `listForUser`/`countUnread` del server para no divergir toast ↔ bell).
  const visibleRolesRef = useRef(
    new Set<string>(visibleTargetRoles(role as BusinessRole)),
  );
  const seenIds = useRef(new Set(initialNotifications.map((n) => n.id)));

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;

      channel = supabase
        .channel(`notifications:${businessIdRef.current}:${userIdRef.current}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `business_id=eq.${businessIdRef.current}`,
          },
          (payload) => {
            const n = payload.new as Notification;
            const isMine =
              n.user_id === userIdRef.current ||
              (n.target_role != null &&
                visibleRolesRef.current.has(n.target_role));
            if (!isMine) return;
            if (seenIds.current.has(n.id)) return;
            seenIds.current.add(n.id);
            setList((cur) => [n, ...cur].slice(0, 50));
            dispatchNotificationToast(n);
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []); // ref-only deps por diseño

  const unread = useMemo(() => list.filter((n) => !n.read_at).length, [list]);
  // Si el server reporta más unread que lo paginado en cliente, usamos su
  // valor — más correcto que el cliente que solo ve los últimos N.
  const displayUnread = Math.max(unread, initialUnreadCount);

  /** Marca una notif como leída solo en el state cliente (optimistic UI).
   *  El server reconcilia luego vía revalidatePath. */
  const markReadLocally = useCallback((id: string) => {
    const nowIso = new Date().toISOString();
    setList((cur) =>
      cur.map((n) => (n.id === id ? { ...n, read_at: nowIso } : n)),
    );
  }, []);

  const markAllReadLocally = useCallback(() => {
    const nowIso = new Date().toISOString();
    setList((cur) =>
      cur.map((n) => (n.read_at ? n : { ...n, read_at: nowIso })),
    );
  }, []);

  return {
    notifications: list,
    unreadCount: displayUnread,
    markReadLocally,
    markAllReadLocally,
  };
}
