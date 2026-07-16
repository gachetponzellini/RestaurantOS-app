import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { BusinessRole } from "@/lib/admin/context";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { notificationOrFilter } from "@/lib/notifications/visibility";

// SEGURIDAD — estas queries arman el filtro `.or(...)` de PostgREST por
// interpolación (ver `notificationOrFilter`). `userId` DEBE venir de session
// (`ctx.user.id`), NUNCA de input externo crudo. Los `target_role` salen de
// `visibleTargetRoles` (allowlist fijo derivado del rol de sesión), no de input
// externo. El patrón con interpolación no escapa contra injection en PostgREST
// .or() — si algún día estos params vinieran de afuera, hay que reescribir con
// filtros separados. Ver DT-007 en wiki/deuda-tecnica.md.

type GenericClient = SupabaseClient;

export type Notification = {
  id: string;
  business_id: string;
  user_id: string | null;
  target_role: string | null;
  type: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

type ListParams = {
  userId: string;
  businessId: string;
  role: BusinessRole;
  limit?: number;
};

/**
 * Lista las notifs visibles para este usuario en este business:
 * dirigidas explícitamente a él, o broadcast a un rol que pueda ver (jerarquía
 * en `visibleTargetRoles`: el dueño ve todo, el mozo ve lo suyo).
 * Order desc por created_at, paginadas con `limit` (default 10).
 */
export async function listForUser({
  userId,
  businessId,
  role,
  limit = 10,
}: ListParams): Promise<Notification[]> {
  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const { data, error } = await service
    .from("notifications")
    .select("id, business_id, user_id, target_role, type, payload, read_at, created_at")
    .eq("business_id", businessId)
    .or(notificationOrFilter(userId, role))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("notifications.listForUser", error);
    return [];
  }
  return (data ?? []) as Notification[];
}

type CountParams = Omit<ListParams, "limit">;

export async function countUnread({
  userId,
  businessId,
  role,
}: CountParams): Promise<number> {
  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const { count, error } = await service
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .is("read_at", null)
    .or(notificationOrFilter(userId, role));

  if (error) {
    console.error("notifications.countUnread", error);
    return 0;
  }
  return count ?? 0;
}
