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

export type ClienteDireccion = {
  id: string;
  label: string | null;
  street: string;
  number: string | null;
  apartment: string | null;
  notes: string | null;
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

/**
 * Direcciones guardadas de un cliente (spec 054 fase 2), para prellenar la
 * dirección de delivery al cargarle un pedido — editable. Scope: el customer
 * debe pertenecer al negocio (verificado antes de leer `customer_addresses`,
 * que no tiene `business_id` propio). Mismo gate que cargar el pedido.
 */
export async function getClienteDirecciones(
  slug: string,
  customerId: string,
): Promise<ActionResult<ClienteDireccion[]>> {
  const business = await getBusiness(slug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  if (!canCargarPedido(ctxResult.data.role)) {
    return actionError("No tenés permiso.");
  }

  const service = createSupabaseServiceClient();

  // Scope de tenant: el customer tiene que ser de este negocio.
  const { data: customer } = await service
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("business_id", business.id)
    .maybeSingle();
  if (!customer) return actionError("Cliente no encontrado.");

  const { data, error } = await service
    .from("customer_addresses")
    .select("id, label, street, number, apartment, notes")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getClienteDirecciones", error);
    return actionError("No pudimos traer las direcciones del cliente.");
  }
  return actionOk((data ?? []) as ClienteDireccion[]);
}
