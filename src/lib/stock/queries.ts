import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

// ── Types ────────────────────────────────────────────────────────

export type StockOverviewItem = {
  stockItemId: string;
  productId: string;
  productName: string;
  categoryName: string | null;
  currentQty: number;
  minQty: number;
  unit: string;
  isLow: boolean;
  updatedAt: string;
};

export type StockMovimiento = {
  id: string;
  kind: "ingreso" | "venta" | "ajuste";
  qty: number;
  reason: string | null;
  createdByName: string | null;
  createdAt: string;
  orderItemId: string | null;
};

// ── getStockOverview ─────────────────────────────────────────────

export async function getStockOverview(
  businessId: string,
): Promise<StockOverviewItem[]> {
  const service = createSupabaseServiceClient();

  const { data } = await service
    .from("stock_items")
    .select(
      "id, product_id, current_qty, min_qty, unit, updated_at, products(name, category_id, categories(name))",
    )
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    stockItemId: row.id,
    productId: row.product_id,
    productName: row.products?.name ?? "—",
    categoryName: row.products?.categories?.name ?? null,
    currentQty: row.current_qty,
    minQty: row.min_qty,
    unit: row.unit,
    isLow: row.current_qty <= row.min_qty,
    updatedAt: row.updated_at,
  }));
}

// ── getStockMovimientos ──────────────────────────────────────────

export async function getStockMovimientos(
  stockItemId: string,
  page = 1,
  pageSize = 20,
): Promise<{ items: StockMovimiento[]; total: number }> {
  const service = createSupabaseServiceClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count } = await service
    .from("stock_movimientos")
    .select(
      "id, kind, qty, reason, created_by, created_at, order_item_id, users(email)",
      { count: "exact" },
    )
    .eq("stock_item_id", stockItemId)
    .order("created_at", { ascending: false })
    .range(from, to);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: StockMovimiento[] = (data ?? []).map((row: any) => ({
    id: row.id,
    kind: row.kind,
    qty: row.qty,
    reason: row.reason,
    createdByName: row.users?.email?.split("@")[0] ?? null,
    createdAt: row.created_at,
    orderItemId: row.order_item_id,
  }));

  return { items, total: count ?? 0 };
}

// ── getLowStockCount ─────────────────────────────────────────────

export async function getLowStockCount(
  businessId: string,
): Promise<number> {
  const service = createSupabaseServiceClient();

  const { data } = await service
    .from("stock_items")
    .select("id, current_qty, min_qty")
    .eq("business_id", businessId);

  return (data ?? []).filter(
    (row) => row.current_qty <= row.min_qty,
  ).length;
}

// ── getAllProductsForConfig ───────────────────────────────────────

export type ProductForStockConfig = {
  id: string;
  name: string;
  categoryName: string | null;
  trackStock: boolean;
  currentQty: number | null;
  minQty: number | null;
};

export async function getAllProductsForConfig(
  businessId: string,
): Promise<ProductForStockConfig[]> {
  const service = createSupabaseServiceClient();

  const { data: products } = await service
    .from("products")
    .select("id, name, track_stock, category_id, categories(name)")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name");

  const { data: stockItems } = await service
    .from("stock_items")
    .select("product_id, current_qty, min_qty")
    .eq("business_id", businessId);

  const stockMap = new Map<string, { current_qty: number; min_qty: number }>();
  for (const si of stockItems ?? []) {
    stockMap.set(si.product_id, { current_qty: si.current_qty, min_qty: si.min_qty });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (products ?? []).map((p: any) => {
    const stock = stockMap.get(p.id);
    return {
      id: p.id,
      name: p.name,
      categoryName: p.categories?.name ?? null,
      trackStock: p.track_stock,
      currentQty: stock?.current_qty ?? null,
      minQty: stock?.min_qty ?? null,
    };
  });
}
