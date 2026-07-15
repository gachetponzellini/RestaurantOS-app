import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Lookup server-only de la print-agent key de un negocio (spec 046). La tabla
 * `print_agent_credentials` es service-role-only; esto se llama solo desde el
 * server (auth del endpoint del agente). Devuelve null si el negocio no tiene
 * key cargada todavía.
 */
export async function getPrintAgentKey(
  businessId: string,
): Promise<string | null> {
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("print_agent_credentials")
    .select("api_key")
    .eq("business_id", businessId)
    .maybeSingle();
  return (data as { api_key: string } | null)?.api_key ?? null;
}
