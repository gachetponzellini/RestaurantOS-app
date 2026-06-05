import { describe, expect, it } from "vitest";

import {
  aggregateSupplierStats,
  filterInvoicesByDateRange,
  totalSpentInRange,
} from "./stats";

describe("proveedores / stats", () => {
  describe("aggregateSupplierStats", () => {
    it("devuelve array vacío con input vacío", () => {
      expect(aggregateSupplierStats([])).toEqual([]);
    });

    it("agrega facturas del mismo proveedor", () => {
      const invoices = [
        { supplierId: "s1", supplierName: "Dist Sur", totalCents: 450000, invoiceDate: "2026-05-01" },
        { supplierId: "s1", supplierName: "Dist Sur", totalCents: 300000, invoiceDate: "2026-05-15" },
        { supplierId: "s1", supplierName: "Dist Sur", totalCents: 250000, invoiceDate: "2026-05-10" },
      ];
      const result = aggregateSupplierStats(invoices);
      expect(result).toHaveLength(1);
      expect(result[0].totalSpentCents).toBe(1000000);
      expect(result[0].invoiceCount).toBe(3);
      expect(result[0].lastInvoiceDate).toBe("2026-05-15");
    });

    it("separa proveedores distintos", () => {
      const invoices = [
        { supplierId: "s1", supplierName: "Dist Sur", totalCents: 100000, invoiceDate: "2026-05-01" },
        { supplierId: "s2", supplierName: "Bebidas SA", totalCents: 200000, invoiceDate: "2026-05-02" },
      ];
      const result = aggregateSupplierStats(invoices);
      expect(result).toHaveLength(2);
    });
  });

  describe("filterInvoicesByDateRange", () => {
    const invoices = [
      { invoiceDate: "2026-04-30", totalCents: 100 },
      { invoiceDate: "2026-05-01", totalCents: 200 },
      { invoiceDate: "2026-05-15", totalCents: 300 },
      { invoiceDate: "2026-05-31", totalCents: 400 },
      { invoiceDate: "2026-06-01", totalCents: 500 },
    ];

    it("filtra por rango incluyendo bordes", () => {
      const result = filterInvoicesByDateRange(invoices, "2026-05-01", "2026-05-31");
      expect(result).toHaveLength(3);
      expect(result[0].totalCents).toBe(200);
      expect(result[2].totalCents).toBe(400);
    });

    it("devuelve vacío si no hay match", () => {
      const result = filterInvoicesByDateRange(invoices, "2026-07-01", "2026-07-31");
      expect(result).toHaveLength(0);
    });
  });

  describe("totalSpentInRange", () => {
    it("suma centavos correctamente", () => {
      expect(totalSpentInRange([{ totalCents: 100 }, { totalCents: 250 }])).toBe(350);
    });

    it("devuelve 0 con array vacío", () => {
      expect(totalSpentInRange([])).toBe(0);
    });
  });
});
