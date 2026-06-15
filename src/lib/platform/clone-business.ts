import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */

export const STRUCTURE_TABLES = [
  "stations",
  "super_categories",
  "categories",
  "floor_plans",
  "products",
  "modifier_groups",
  "modifiers",
  "daily_menus",
  "daily_menu_components",
  "tables",
  "ingredients",
  "ingredient_presentations",
  "ingredient_recipes",
  "recipes",
  "business_hours",
  "reservation_settings",
  "payment_method_configs",
  "chatbot_configs",
] as const;

export const SECRET_BUSINESS_COLUMNS = [
  "mp_access_token",
  "mp_webhook_secret",
  "mp_public_key",
  "afip_provider_api_key",
  "afip_provider_api_token",
  "afip_provider_user_token",
] as const;

export const OPERATIONAL_TABLES = [
  "orders",
  "order_items",
  "order_splits",
  "order_split_items",
  "payments",
  "comandas",
  "comanda_items",
  "cajas",
  "caja_turnos",
  "caja_movimientos",
  "reservations",
  "customers",
  "notifications",
  "whatsapp_outbox",
  "clock_punches",
  "clock_blocked_attempts",
  "promos",
  "promo_redemptions",
  "campaigns",
  "campaign_deliveries",
] as const;

type ServiceClient = SupabaseClient<any>;

type IdMap = Map<string, string>;

async function cloneRows(
  service: ServiceClient,
  table: string,
  sourceBusinessId: string,
  targetBusinessId: string,
  opts: {
    fkMaps?: Record<string, IdMap>;
    hasBizId?: boolean;
    parentFk?: { column: string; map: IdMap };
  } = {},
): Promise<IdMap> {
  const idMap: IdMap = new Map();
  const { fkMaps = {}, hasBizId = true, parentFk } = opts;

  let query = service.from(table).select("*");
  if (hasBizId) {
    query = query.eq("business_id", sourceBusinessId);
  } else if (parentFk) {
    const parentIds = [...parentFk.map.values()];
    if (parentIds.length === 0) return idMap;
    query = query.in(parentFk.column, [...parentFk.map.keys()]);
  }

  const { data: rows } = await query;
  if (!rows || rows.length === 0) return idMap;

  for (const row of rows) {
    const oldId = (row as Record<string, unknown>).id as string;
    const newRow: Record<string, unknown> = { ...row };

    delete newRow.id;
    delete newRow.created_at;
    delete newRow.updated_at;

    if (hasBizId) {
      newRow.business_id = targetBusinessId;
    }

    for (const [col, map] of Object.entries(fkMaps)) {
      const oldFk = newRow[col] as string | null;
      if (oldFk && map.has(oldFk)) {
        newRow[col] = map.get(oldFk);
      }
    }

    if (parentFk) {
      const oldParent = newRow[parentFk.column] as string;
      newRow[parentFk.column] = parentFk.map.get(oldParent) ?? oldParent;
    }

    const { data: inserted } = await service
      .from(table)
      .insert(newRow)
      .select("id")
      .single();

    if (inserted) {
      idMap.set(oldId, inserted.id);
    }
  }

  return idMap;
}

async function cloneRowsComposite(
  service: ServiceClient,
  table: string,
  sourceBusinessId: string,
  targetBusinessId: string,
  fkMaps: Record<string, IdMap>,
  opts: {
    hasBizId?: boolean;
    parentFk?: { column: string; map: IdMap };
  } = {},
): Promise<void> {
  const { hasBizId = false, parentFk } = opts;

  let query = service.from(table).select("*");
  if (hasBizId) {
    query = query.eq("business_id", sourceBusinessId);
  } else if (parentFk) {
    if (parentFk.map.size === 0) return;
    query = query.in(parentFk.column, [...parentFk.map.keys()]);
  }

  const { data: rows } = await query;
  if (!rows || rows.length === 0) return;

  for (const row of rows) {
    const newRow: Record<string, unknown> = { ...row };
    delete newRow.id;
    delete newRow.created_at;
    delete newRow.updated_at;

    if (hasBizId) {
      newRow.business_id = targetBusinessId;
    }

    for (const [col, map] of Object.entries(fkMaps)) {
      const oldFk = newRow[col] as string | null;
      if (oldFk && map.has(oldFk)) {
        newRow[col] = map.get(oldFk);
      }
    }

    if (parentFk) {
      const oldParent = newRow[parentFk.column] as string;
      newRow[parentFk.column] = parentFk.map.get(oldParent) ?? oldParent;
    }

    await service.from(table).insert(newRow);
  }
}

export async function cloneBusinessStructure(
  service: ServiceClient,
  sourceBusinessId: string,
  targetBusinessId: string,
): Promise<void> {
  const stationMap = await cloneRows(
    service,
    "stations",
    sourceBusinessId,
    targetBusinessId,
  );

  const superCatMap = await cloneRows(
    service,
    "super_categories",
    sourceBusinessId,
    targetBusinessId,
  );

  const categoryMap = await cloneRows(
    service,
    "categories",
    sourceBusinessId,
    targetBusinessId,
    { fkMaps: { super_category_id: superCatMap, station_id: stationMap } },
  );

  const floorPlanMap = await cloneRows(
    service,
    "floor_plans",
    sourceBusinessId,
    targetBusinessId,
  );

  const productMap = await cloneRows(
    service,
    "products",
    sourceBusinessId,
    targetBusinessId,
    { fkMaps: { category_id: categoryMap, station_id: stationMap } },
  );

  const modGroupMap = await cloneRows(
    service,
    "modifier_groups",
    sourceBusinessId,
    targetBusinessId,
    { fkMaps: { product_id: productMap } },
  );

  await cloneRows(service, "modifiers", sourceBusinessId, targetBusinessId, {
    hasBizId: false,
    parentFk: { column: "group_id", map: modGroupMap },
  });

  const dailyMenuMap = await cloneRows(
    service,
    "daily_menus",
    sourceBusinessId,
    targetBusinessId,
  );

  await cloneRowsComposite(
    service,
    "daily_menu_components",
    sourceBusinessId,
    targetBusinessId,
    { menu_id: dailyMenuMap, product_id: productMap },
    { parentFk: { column: "menu_id", map: dailyMenuMap } },
  );

  await cloneRows(service, "tables", sourceBusinessId, targetBusinessId, {
    hasBizId: false,
    parentFk: { column: "floor_plan_id", map: floorPlanMap },
    fkMaps: { floor_plan_id: floorPlanMap },
  });

  const ingredientMap = await cloneRows(
    service,
    "ingredients",
    sourceBusinessId,
    targetBusinessId,
  );

  await cloneRows(
    service,
    "ingredient_presentations",
    sourceBusinessId,
    targetBusinessId,
    {
      hasBizId: false,
      parentFk: { column: "ingredient_id", map: ingredientMap },
    },
  );

  await cloneRowsComposite(
    service,
    "ingredient_recipes",
    sourceBusinessId,
    targetBusinessId,
    {
      parent_ingredient_id: ingredientMap,
      child_ingredient_id: ingredientMap,
    },
    { parentFk: { column: "parent_ingredient_id", map: ingredientMap } },
  );

  await cloneRowsComposite(
    service,
    "recipes",
    sourceBusinessId,
    targetBusinessId,
    { product_id: productMap, ingredient_id: ingredientMap },
    { parentFk: { column: "product_id", map: productMap } },
  );

  await cloneRows(
    service,
    "business_hours",
    sourceBusinessId,
    targetBusinessId,
  );

  await cloneRows(
    service,
    "reservation_settings",
    sourceBusinessId,
    targetBusinessId,
  );

  await cloneRows(
    service,
    "payment_method_configs",
    sourceBusinessId,
    targetBusinessId,
  );

  await cloneRows(
    service,
    "chatbot_configs",
    sourceBusinessId,
    targetBusinessId,
  );
}
