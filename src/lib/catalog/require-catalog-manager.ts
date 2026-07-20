import "server-only";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { requireMozoActionContext } from "@/lib/mozo/auth";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * Gate estándar del catálogo/back-office: resuelve el negocio por slug, exige
 * sesión con membership activa (requireMozoActionContext ya corta `disabled_at`)
 * y rol admin/encargado.
 *
 * Las actions de catálogo mutan con el server/service client. Sin este gate,
 * la RLS de escritura de products/categories/daily_menus/stations es
 * `is_business_member` (cualquier rol), así que un mozo/personal podía
 * crear/editar/borrar productos y PRECIOS — operación reservada a la gestión
 * del negocio (security review #5). Espejo de `requireCatalogAdmin`
 * (ingredients/actions.ts) y del patrón de `stock/actions.ts`.
 */
export async function requireCatalogManager(
  businessSlug: string,
): Promise<ActionResult<{ businessId: string }>> {
  const service = createSupabaseServiceClient();
  const { data: biz } = await service
    .from("businesses")
    .select("id")
    .eq("slug", businessSlug)
    .maybeSingle();
  if (!biz) return actionError("Negocio no encontrado.");
  const businessId = (biz as { id: string }).id;

  const ctx = await requireMozoActionContext(businessId);
  if (!ctx.ok) return ctx;
  if (ctx.data.role !== "admin" && ctx.data.role !== "encargado") {
    return actionError("Solo admin o encargado pueden gestionar el catálogo.");
  }
  return actionOk({ businessId });
}
