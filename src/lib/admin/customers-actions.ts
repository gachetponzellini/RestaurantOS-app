"use server";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { requireMozoActionContext } from "@/lib/mozo/auth";
import { canCargarPedido } from "@/lib/permissions/can";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

export type ClienteMatch = {
  id: string;
  name: string | null;
  phone: string;
};

/**
 * Busca clientes existentes del negocio por nombre o teléfono (spec 054 fase 2),
 * para elegirlos al cargar un pedido en vez de tipear los datos a mano. Devuelve
 * un subconjunto acotado (≤8) — a diferencia de `listCustomers`, que trae todos
 * y filtra en memoria (pensado para la lista full-page).
 *
 * Gate del staff (`canCargarPedido` = admin/encargado, igual que cargar el
 * pedido) + scope por `business_id`.
 */
export async function buscarClientes(
  slug: string,
  query: string,
): Promise<ActionResult<ClienteMatch[]>> {
  // Sanitizamos el término: sacamos los caracteres que rompen la sintaxis de
  // PostgREST `.or()` / los wildcards de ilike. Con <2 chars no buscamos (ruido).
  const term = query.replace(/[,*()%_]/g, " ").trim();
  if (term.length < 2) return actionOk([]);

  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  if (!canCargarPedido(ctxResult.data.role)) {
    return actionError("No tenés permiso para buscar clientes.");
  }

  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from("customers")
    .select("id, name, phone")
    .eq("business_id", business.id)
    .or(`name.ilike.*${term}*,phone.ilike.*${term}*`)
    .order("name", { ascending: true })
    .limit(8);

  if (error) {
    console.error("buscarClientes", error);
    return actionError("No pudimos buscar clientes.");
  }
  return actionOk((data ?? []) as ClienteMatch[]);
}
