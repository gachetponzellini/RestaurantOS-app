"use server";

import {
  getSupplierInvoices as _getInvoices,
  getSupplierIngredients as _getIngredients,
  getSupplierStats as _getStats,
} from "./queries";

export async function getSupplierInvoices(supplierId: string, businessId: string) {
  return _getInvoices(supplierId, businessId);
}

export async function getSupplierIngredients(supplierId: string, businessId: string) {
  return _getIngredients(supplierId, businessId);
}

export async function getSupplierStats(businessId: string, from?: string, to?: string) {
  return _getStats(businessId, from, to);
}
