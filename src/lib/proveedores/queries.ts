import "server-only";


import { createSupabaseServiceClient } from "@/lib/supabase/service";

import type {
  SupplierIngredientLink,
  SupplierInvoice,
  SupplierStats,
  SupplierWithStats,
} from "./types";

function db() {
  return createSupabaseServiceClient();
}

// ── Suppliers list (with aggregated stats) ──────────────────────

export async function getSuppliers(
  businessId: string,
): Promise<SupplierWithStats[]> {
  const service = db();

  const { data: suppliers } = await service
    .from("suppliers")
    .select("*")
    .eq("business_id", businessId)
    .order("name");

  if (!suppliers?.length) return [];

  const supplierIds = suppliers.map((s) => s.id);

  const { data: invoiceAgg } = await service
    .from("supplier_invoices")
    .select("supplier_id, total_cents, invoice_date")
    .eq("business_id", businessId)
    .in("supplier_id", supplierIds);

  const statsMap = new Map<
    string,
    { total: number; count: number; last: string | null }
  >();

  for (const inv of invoiceAgg ?? []) {
    const entry = statsMap.get(inv.supplier_id) ?? {
      total: 0,
      count: 0,
      last: null,
    };
    entry.total += inv.total_cents;
    entry.count += 1;
    if (!entry.last || inv.invoice_date > entry.last) {
      entry.last = inv.invoice_date;
    }
    statsMap.set(inv.supplier_id, entry);
  }

  return suppliers.map((row) => {
    const stats = statsMap.get(row.id);
    return {
      id: row.id,
      businessId: row.business_id,
      name: row.name,
      cuit: row.cuit,
      contact: row.contact,
      phone: row.phone,
      email: row.email,
      notes: row.notes,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      totalSpentCents: stats?.total ?? 0,
      invoiceCount: stats?.count ?? 0,
      lastInvoiceDate: stats?.last ?? null,
    };
  });
}

// ── Supplier invoices ───────────────────────────────────────────

export async function getSupplierInvoices(
  supplierId: string,
  businessId: string,
): Promise<SupplierInvoice[]> {
  const service = db();

  const { data: invoices } = await service
    .from("supplier_invoices")
    .select("*")
    .eq("supplier_id", supplierId)
    .eq("business_id", businessId)
    .order("invoice_date", { ascending: false });

  if (!invoices?.length) return [];

  const results: SupplierInvoice[] = [];
  for (const row of invoices) {
    let photoSignedUrl: string | null = null;
    if (row.photo_url) {
      const { data } = await service.storage
        .from("supplier-invoices")
        .createSignedUrl(row.photo_url, 3600);
      photoSignedUrl = data?.signedUrl ?? null;
    }

    results.push({
      id: row.id,
      businessId: row.business_id,
      supplierId: row.supplier_id,
      invoiceNumber: row.invoice_number,
      invoiceDate: row.invoice_date,
      totalCents: row.total_cents,
      photoUrl: row.photo_url,
      photoSignedUrl,
      notes: row.notes,
      createdBy: row.created_by,
      createdAt: row.created_at,
    });
  }

  return results;
}

// ── Supplier stats by date range ────────────────────────────────

export async function getSupplierStats(
  businessId: string,
  from?: string,
  to?: string,
): Promise<SupplierStats[]> {
  const service = db();

  let query = service
    .from("supplier_invoices")
    .select("supplier_id, total_cents, invoice_date, suppliers!inner(name)")
    .eq("business_id", businessId);

  if (from) query = query.gte("invoice_date", from);
  if (to) query = query.lte("invoice_date", to);

  const { data } = await query;
  if (!data?.length) return [];

  const map = new Map<
    string,
    { name: string; total: number; count: number; last: string | null }
  >();

  for (const row of data) {
    const supplierName =
      (row.suppliers as unknown as { name: string })?.name ?? "—";
    const entry = map.get(row.supplier_id) ?? {
      name: supplierName,
      total: 0,
      count: 0,
      last: null,
    };
    entry.total += row.total_cents;
    entry.count += 1;
    if (!entry.last || row.invoice_date > entry.last) {
      entry.last = row.invoice_date;
    }
    map.set(row.supplier_id, entry);
  }

  return Array.from(map.entries()).map(([id, v]) => ({
    supplierId: id,
    supplierName: v.name,
    totalSpentCents: v.total,
    invoiceCount: v.count,
    lastInvoiceDate: v.last,
  }));
}

// ── Supplier ↔ ingredients links ────────────────────────────────

export async function getSupplierIngredients(
  supplierId: string,
  businessId: string,
): Promise<SupplierIngredientLink[]> {
  const service = db();

  const { data } = await service
    .from("supplier_ingredients")
    .select("supplier_id, ingredient_id, created_at, ingredients!inner(name, unit)")
    .eq("supplier_id", supplierId)
    .eq("business_id", businessId);

  if (!data?.length) return [];

  return data.map((row) => {
    const ingredient = row.ingredients as unknown as { name: string; unit: string };
    return {
      supplierId: row.supplier_id,
      ingredientId: row.ingredient_id,
      ingredientName: ingredient.name,
      ingredientUnit: ingredient.unit,
      createdAt: row.created_at,
    };
  });
}

// ── Ingredients for search (used by link dialog) ────────────────

export async function getIngredientsForLinking(
  businessId: string,
): Promise<{ id: string; name: string; unit: string }[]> {
  const service = db();
  const { data } = await service
    .from("ingredients")
    .select("id, name, unit")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}
