"use server";

import { requireMozoActionContext } from "@/lib/mozo/auth";
import { canManageProveedores } from "@/lib/permissions/can";

import {
  getSupplierInvoices as _getInvoices,
  getSupplierIngredients as _getIngredients,
  getSupplierStats as _getStats,
} from "./queries";

/**
 * Estos wrappers son "use server" → invocables directo desde el cliente. Las
 * queries usan el service client (bypassa RLS) filtrando solo por el `businessId`
 * que viene del argumento, así que sin este gate cualquiera podía leer finanzas
 * de proveedores de OTRO negocio pasando su id (IDOR cross-tenant, sin auth).
 * Exigimos membership activa + rol con permiso de proveedores sobre ese negocio.
 */
async function assertCanReadProveedores(businessId: string): Promise<void> {
  const ctx = await requireMozoActionContext(businessId);
  if (!ctx.ok || !canManageProveedores(ctx.data.role)) {
    throw new Error("No autorizado.");
  }
}

export async function getSupplierInvoices(supplierId: string, businessId: string) {
  await assertCanReadProveedores(businessId);
  return _getInvoices(supplierId, businessId);
}

export async function getSupplierIngredients(supplierId: string, businessId: string) {
  await assertCanReadProveedores(businessId);
  return _getIngredients(supplierId, businessId);
}

export async function getSupplierStats(businessId: string, from?: string, to?: string) {
  await assertCanReadProveedores(businessId);
  return _getStats(businessId, from, to);
}
