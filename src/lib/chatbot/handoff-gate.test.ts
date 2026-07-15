import { describe, expect, it } from "vitest";

import { decideAgentEnabled } from "./agent";

// Gate de handoff (spec 32). Decisión pura, sin DB. La invariante dura es que
// el bot y el humano NO contesten el mismo turno → ante duda, el bot calla.
describe("decideAgentEnabled (gate de handoff, spec 32)", () => {
  it("agente encendido → el bot responde", () => {
    expect(decideAgentEnabled({ agent_enabled: true }, null)).toBe(true);
  });

  it("agente apagado (staff atendiendo) → el bot calla", () => {
    expect(decideAgentEnabled({ agent_enabled: false }, null)).toBe(false);
  });

  it("error de lectura → FAIL-CLOSED: el bot calla (no pisa al humano)", () => {
    expect(decideAgentEnabled(null, new Error("db down"))).toBe(false);
    // También si vino fila + error (defensivo): manda el error.
    expect(decideAgentEnabled({ agent_enabled: true }, { code: "500" })).toBe(false);
  });

  it("fila ausente SIN error → conversación nueva legítima → el bot responde", () => {
    // La columna es NOT NULL DEFAULT true; una conversación recién creada que
    // aún no se lee como fila no debe silenciar al bot.
    expect(decideAgentEnabled(null, null)).toBe(true);
  });
});
