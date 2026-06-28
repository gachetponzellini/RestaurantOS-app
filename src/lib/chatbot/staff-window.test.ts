import { describe, expect, it } from "vitest";

import {
  WHATSAPP_WINDOW_HOURS,
  isWindowOpen,
  lastInboundAt,
} from "./staff-window";

// Punto de referencia fijo para no depender del reloj del runner.
const NOW = Date.parse("2026-06-25T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("WHATSAPP_WINDOW_HOURS", () => {
  it("es 24 (ventana de servicio de WhatsApp)", () => {
    expect(WHATSAPP_WINDOW_HOURS).toBe(24);
  });
});

describe("isWindowOpen", () => {
  it("abierta si el último mensaje del cliente fue hace < 24 h", () => {
    expect(isWindowOpen(ago(1 * HOUR), NOW)).toBe(true);
    expect(isWindowOpen(ago(23 * HOUR), NOW)).toBe(true);
    // 23h59m59s sigue dentro.
    expect(isWindowOpen(ago(24 * HOUR - 1000), NOW)).toBe(true);
  });

  it("cerrada en el borde exacto de 24 h", () => {
    expect(isWindowOpen(ago(24 * HOUR), NOW)).toBe(false);
  });

  it("cerrada si el último mensaje del cliente fue hace ≥ 24 h", () => {
    expect(isWindowOpen(ago(25 * HOUR), NOW)).toBe(false);
    expect(isWindowOpen(ago(72 * HOUR), NOW)).toBe(false);
  });

  it("cerrada si no hay ningún mensaje entrante (null)", () => {
    expect(isWindowOpen(null, NOW)).toBe(false);
  });

  it("cerrada ante un timestamp inválido (no rompe)", () => {
    expect(isWindowOpen("no-es-fecha", NOW)).toBe(false);
  });
});

describe("lastInboundAt", () => {
  it("devuelve el created_at del último mensaje role:'user'", () => {
    const messages = [
      { role: "user", created_at: ago(10 * HOUR) },
      { role: "assistant", created_at: ago(9 * HOUR) },
      { role: "user", created_at: ago(2 * HOUR) },
      { role: "assistant", created_at: ago(1 * HOUR) },
    ];
    expect(lastInboundAt(messages)).toBe(ago(2 * HOUR));
  });

  it("ignora mensajes del bot/staff (assistant) para reabrir la ventana", () => {
    const messages = [
      { role: "user", created_at: ago(30 * HOUR) },
      { role: "assistant", created_at: ago(1 * HOUR) },
    ];
    // El último user fue hace 30 h aunque el assistant sea reciente.
    expect(lastInboundAt(messages)).toBe(ago(30 * HOUR));
  });

  it("es null si no hay mensajes del cliente", () => {
    expect(lastInboundAt([{ role: "assistant", created_at: ago(1 * HOUR) }])).toBe(
      null,
    );
    expect(lastInboundAt([])).toBe(null);
  });

  it("toma el más reciente aunque los mensajes vengan desordenados", () => {
    const messages = [
      { role: "user", created_at: ago(2 * HOUR) },
      { role: "user", created_at: ago(20 * HOUR) },
      { role: "user", created_at: ago(5 * HOUR) },
    ];
    expect(lastInboundAt(messages)).toBe(ago(2 * HOUR));
  });
});
