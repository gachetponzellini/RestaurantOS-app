import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Resuelve el id de template del proveedor a partir del nombre lógico + idioma,
 * por negocio y proveedor. Gupshup identifica las plantillas por UUID (no por
 * name+language como Meta/360dialog), así que el envío proactivo por Gupshup
 * necesita este mapeo. Sin fila → `null` (el sender no envía a ciegas).
 */
export async function resolveProviderTemplateId(
  businessId: string,
  provider: string,
  templateName: string,
  lang: string,
): Promise<string | null> {
  const service = createSupabaseServiceClient() as unknown as SupabaseClient;
  const { data } = await service
    .from("whatsapp_template_map")
    .select("provider_template_id")
    .eq("business_id", businessId)
    .eq("provider", provider)
    .eq("template_name", templateName)
    .eq("lang", lang)
    .maybeSingle();
  return (
    (data as { provider_template_id?: string } | null)?.provider_template_id ??
    null
  );
}
