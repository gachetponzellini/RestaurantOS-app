"use server";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { ensureAdminAccess } from "@/lib/admin/context";
import {
  getActiveOrderByTable,
  getComandasByOrder,
  getStationsByBusiness,
  type ComandaConItems,
} from "@/lib/comandas/queries";
import { getCatalogForMozo, type CatalogForMozo } from "@/lib/mozo/catalog-query";
import {
  getDailyMenusForToday,
  type DailyMenuForMozo,
} from "@/lib/mozo/daily-menus-query";
import { getTopProductIds } from "@/lib/mozo/top-products";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

/**
 * Datos para "Cargar pedido" embebido en el panel del salón, partidos en dos
 * para que la apertura se sienta instantánea:
 *
 *  - `loadPedirCatalog`  → bundle business-level (catálogo, stations, menús del
 *    día, top). Es lo PESADO. El cliente lo prefetchea al montar y lo cachea,
 *    así no se vuelve a pedir en cada apertura.
 *  - `loadTableComandas` → comandas de la mesa puntual. Es CHICO y rápido; es
 *    lo único que se busca al abrir el panel.
 *
 * `table` y `role` los aporta el cliente (ya los tiene en el plano/props), así
 * que no se vuelven a consultar.
 */

export type PedirCatalogBundle = {
  businessName: string;
  catalog: CatalogForMozo;
  stationNameById: Record<string, string>;
  topProductIds: string[];
  dailyMenus: DailyMenuForMozo[];
};

async function gateAdmin(slug: string) {
  const business = await getBusiness(slug);
  if (!business) return { ok: false as const, error: "Negocio no encontrado." };
  const ctx = await ensureAdminAccess(business.id, slug);
  if (
    !ctx.isPlatformAdmin &&
    ctx.role !== "admin" &&
    ctx.role !== "encargado"
  ) {
    return { ok: false as const, error: "No tenés permisos." };
  }
  return { ok: true as const, business };
}

export async function loadPedirCatalog(
  slug: string,
): Promise<ActionResult<PedirCatalogBundle>> {
  const gate = await gateAdmin(slug);
  if (!gate.ok) return actionError(gate.error);
  const { business } = gate;

  const todayDow = new Date().getDay();
  const [catalog, stations, topProductIds, dailyMenus] = await Promise.all([
    getCatalogForMozo(business.id),
    getStationsByBusiness(business.id),
    getTopProductIds(business.id, { limit: 12 }),
    getDailyMenusForToday(business.id, todayDow),
  ]);

  const stationNameById: Record<string, string> = {};
  for (const s of stations) stationNameById[s.id] = s.name;

  return actionOk({
    businessName: business.name,
    catalog,
    stationNameById,
    topProductIds,
    dailyMenus,
  });
}

export async function loadTableComandas(
  slug: string,
  tableId: string,
): Promise<ActionResult<ComandaConItems[]>> {
  const gate = await gateAdmin(slug);
  if (!gate.ok) return actionError(gate.error);
  const { business } = gate;

  // Cross-tenant: la mesa debe pertenecer a un floor_plan de este business.
  const service = createSupabaseServiceClient();
  const { data: tableRow } = await service
    .from("tables")
    .select("id, floor_plans!inner(business_id)")
    .eq("id", tableId)
    .maybeSingle();
  const tableBusinessId = (
    tableRow as { floor_plans?: { business_id: string } } | null
  )?.floor_plans?.business_id;
  if (!tableRow || tableBusinessId !== business.id) {
    return actionError("Mesa no encontrada.");
  }

  const activeOrder = await getActiveOrderByTable(tableId, business.id);
  const comandas = activeOrder
    ? await getComandasByOrder(activeOrder.id, business.id)
    : [];
  return actionOk(comandas);
}
