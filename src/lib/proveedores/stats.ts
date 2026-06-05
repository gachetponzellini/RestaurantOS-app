import type { SupplierStats } from "./types";

type InvoiceRow = {
  supplierId: string;
  supplierName: string;
  totalCents: number;
  invoiceDate: string;
};

export function aggregateSupplierStats(invoices: InvoiceRow[]): SupplierStats[] {
  const map = new Map<
    string,
    { name: string; total: number; count: number; last: string | null }
  >();

  for (const inv of invoices) {
    const entry = map.get(inv.supplierId) ?? {
      name: inv.supplierName,
      total: 0,
      count: 0,
      last: null,
    };
    entry.total += inv.totalCents;
    entry.count += 1;
    if (!entry.last || inv.invoiceDate > entry.last) {
      entry.last = inv.invoiceDate;
    }
    map.set(inv.supplierId, entry);
  }

  return Array.from(map.entries()).map(([id, v]) => ({
    supplierId: id,
    supplierName: v.name,
    totalSpentCents: v.total,
    invoiceCount: v.count,
    lastInvoiceDate: v.last,
  }));
}

export function filterInvoicesByDateRange<T extends { invoiceDate: string }>(
  invoices: T[],
  from: string,
  to: string,
): T[] {
  return invoices.filter((inv) => inv.invoiceDate >= from && inv.invoiceDate <= to);
}

export function totalSpentInRange(invoices: { totalCents: number }[]): number {
  return invoices.reduce((sum, inv) => sum + inv.totalCents, 0);
}
