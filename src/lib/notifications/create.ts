import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

type GenericClient = SupabaseClient;

export async function createNotification(params: {
  businessId: string;
  userId?: string | null;
  targetRole?: string | null;
  type: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const { error } = await service.from("notifications").insert({
    business_id: params.businessId,
    user_id: params.userId ?? null,
    target_role: params.targetRole ?? null,
    type: params.type,
    payload: params.payload,
  });
  if (error) console.error("createNotification", error);
}
