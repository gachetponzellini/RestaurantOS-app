import { describe, expect, it } from "vitest";

import {
  condicionIvaDefault,
  condicionesValidasPara,
  esCondicionValidaPara,
} from "./condicion-iva";

describe("condicion-iva · coherencia tipo↔condición (RG 5616)", () => {
  it("Factura/NC A → Responsable Inscripto o Monotributo, default RI", () => {
    expect(condicionesValidasPara("factura_a")).toEqual([1, 6]);
    expect(condicionesValidasPara("nota_credito_a")).toEqual([1, 6]);
    expect(condicionIvaDefault("factura_a")).toBe(1);
  });

  it("Factura/NC B → Monotributo, Exento o Consumidor Final, default Monotributo", () => {
    expect(condicionesValidasPara("factura_b")).toEqual([6, 4, 5]);
    expect(condicionesValidasPara("nota_credito_b")).toEqual([6, 4, 5]);
    expect(condicionIvaDefault("factura_b")).toBe(6);
  });

  it("rechaza los combos incoherentes: A+Consumidor Final, A+Exento, B+RI", () => {
    expect(esCondicionValidaPara("factura_a", 5)).toBe(false); // CF no recibe A
    expect(esCondicionValidaPara("factura_a", 4)).toBe(false); // Exento no recibe A
    expect(esCondicionValidaPara("factura_b", 1)).toBe(false); // RI recibe A, no B
  });

  it("acepta los combos válidos que usa la spec 053", () => {
    expect(esCondicionValidaPara("factura_a", 6)).toBe(true); // A a Monotributo (US2)
    expect(esCondicionValidaPara("factura_b", 6)).toBe(true); // B a Monotributo (US1)
    expect(esCondicionValidaPara("factura_b", 4)).toBe(true); // B a Exento
    expect(esCondicionValidaPara("factura_b", 5)).toBe(true); // B a Consumidor Final
    expect(esCondicionValidaPara("factura_a", 1)).toBe(true); // A a RI (histórico)
  });
});
