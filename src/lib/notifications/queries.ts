import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { BusinessRole } from "@/lib/admin/context";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

// SEGURIDAD — estas queries usan `.or(\`user_id.eq.${userId},target_role.eq.${role}\`)`
// con interpolación directa. `userId` y `role` DEBEN venir de session/types del
// backend (`ctx.user.id`, `ctx.role`), NUNCA de input externo crudo. El patrón
// con interpolación no escapa contra injection en PostgREST .or() — si algún día
// estos params vinieran de afuera, hay que reescribir usando filtros separados.
// Ver DT-007 en wiki/deuda-tecnica.md.

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
 * dirigidas explícitamente a él, o broadcast a su rol.
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
    .or(`user_id.eq.${userId},target_role.eq.${role}`)
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
    .or(`user_id.eq.${userId},target_role.eq.${role}`);

  if (error) {
    console.error("notifications.countUnread", error);
    return 0;
  }
  return count ?? 0;
}
