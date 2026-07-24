import { describe, expect, it } from "vitest";

import {
  buildComandaContent,
  buildTicketLines,
  renderEscPos,
  type TicketComanda,
} from "./ticket";
import fixtures from "./__fixtures__/tickets.json";

// Fixtures congelados del output ACTUAL del agente (print-agent/agent.mjs) por
// tipo de ticket. El test asevera que el módulo del server produce EXACTAMENTE
// los mismos bytes → red de seguridad contra una regresión de formato sobre la
// impresión de golf al mover el render al server (spec 051, D3 · FR-006/SC-003).
//
// La comanda base coincide 1:1 con la del harness `freeze-fixtures.mjs` que
// generó `__fixtures__/tickets.json`. Si cambia el formato a propósito, hay que
// regenerar los fixtures (y verificar en golf) — no editar a mano.

const base: TicketComanda = {
  comanda_id: "ab12cd34-0000-0000-0000-000000000000",
  station_name: "Cocina",
  table_label: "5",
  batch: 2,
  emitted_at: "2026-07-20T18:30:00-03:00",
  cancelled: false,
  cancelled_reason: null,
  reprint: false,
  items: [
    { quantity: 1, product_name: "Milanesa napolitana", modifiers: [], notes: null },
    { quantity: 2, product_name: "Ñoquis", modifiers: ["con crema"], notes: "bien calientes" },
    { quantity: 1, product_name: "Café con leche", modifiers: [], notes: null },
  ],
};

const cases: Record<keyof typeof fixtures, TicketComanda> = {
  normal: base,
  anulada: { ...base, cancelled: true, cancelled_reason: "cliente se fue" },
  reimpresion: { ...base, reprint: true },
  sinItems: { ...base, items: [] },
};

describe("buildComandaContent · paridad byte-a-byte con el agente", () => {
  for (const name of Object.keys(cases) as (keyof typeof fixtures)[]) {
    it(`ticket ${name}: escpos_b64 idéntico al fixture congelado`, () => {
      const { escpos_b64 } = buildComandaContent(cases[name]);
      expect(escpos_b64).toBe(fixtures[name].escpos_b64);
    });

    it(`ticket ${name}: plain idéntico al fixture congelado`, () => {
      const { plain } = buildComandaContent(cases[name]);
      expect(plain).toBe(fixtures[name].plain);
    });
  }
});

describe("buildComandaContent · base64", () => {
  it("escpos_b64 decodifica (latin1) exactamente a los bytes de renderEscPos", () => {
    const expected = renderEscPos(buildTicketLines(base));
    const { escpos_b64 } = buildComandaContent(base);
    const decoded = Buffer.from(escpos_b64, "base64").toString("latin1");
    expect(decoded).toBe(expected);
  });
});
