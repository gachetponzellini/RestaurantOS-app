import { describe, expect, it } from "vitest";

import { buildGatewayInvoiceBody } from "./gateway-payload";
import type { InvoiceRequest } from "./types";

const base: InvoiceRequest = {
  tipo: "factura_b",
  puntoVenta: 1,
  cuitEmisor: "20123456789",
  totalCents: 12_100, // $121,00 = neto 100 + IVA 21
  concepto: "productos",
};

describe("buildGatewayInvoiceBody", () => {
  it("Factura B consumidor final → doc 99, condición IVA 5, IVA 21% discriminado", () => {
    const body = buildGatewayInvoiceBody(base, "2026-07-07");
    expect(body).toMatchObject({
      punto_venta: 1,
      tipo_comprobante: 6,
      concepto: 1,
      receptor: { doc_tipo: 99, doc_nro: "0", condicion_iva: 5 },
      importe_total: 121,
      importe_neto: 100,
      iva: [{ id: 5, base_imp: 100, importe: 21 }],
      fecha: "2026-07-07",
    });
    expect(body.comprobantes_asociados).toBeUndefined();
  });

  it("Factura A con CUIT → doc 80, condición IVA 1 (RI)", () => {
    const body = buildGatewayInvoiceBody(
      { ...base, tipo: "factura_a", cuitReceptor: "30-71512345-6", razonSocialReceptor: "ACME SA" },
      "2026-07-07",
    );
    expect(body).toMatchObject({
      tipo_comprobante: 1,
      receptor: {
        doc_tipo: 80,
        doc_nro: "30715123456",
        condicion_iva: 1,
        razon_social: "ACME SA",
      },
    });
  });

  it("Nota de crédito B → incluye comprobantes_asociados mapeados a tipos ARCA", () => {
    const body = buildGatewayInvoiceBody(
      {
        ...base,
        tipo: "nota_credito_b",
        comprobantesAsociados: [{ tipo: "factura_b", puntoVenta: 1, numero: 42 }],
      },
      "2026-07-07",
    );
    expect(body.tipo_comprobante).toBe(8);
    expect(body.comprobantes_asociados).toEqual([
      { tipo: 6, punto_venta: 1, numero: 42 },
    ]);
  });

  it("importes redondean a 2 decimales en pesos", () => {
    const body = buildGatewayInvoiceBody(
      { ...base, totalCents: 10_000 },
      "2026-07-07",
    );
    // total 100,00 → neto 82,64 + IVA 17,36 (split de calculate-amounts).
    expect(body.importe_total).toBe(100);
    expect(body.importe_neto).toBeCloseTo(82.64, 2);
    const iva = body.iva as Array<{ importe: number }>;
    expect(iva[0].importe).toBeCloseTo(17.36, 2);
  });
});
