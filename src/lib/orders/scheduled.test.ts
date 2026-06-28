import { describe, expect, it } from "vitest";

import type { BusinessHourSlot } from "@/lib/business-hours/schema";

import {
  isScheduledForLater,
  SCHEDULED_MARCH_LEAD_MIN,
  SCHEDULED_MAX_WINDOW_DAYS,
  shouldMarchNow,
  validateScheduledOrder,
} from "./scheduled";

// Reloj de referencia: jueves 2026-06-25 12:00 hora AR (UTC-3).
const NOW = new Date("2026-06-25T12:00:00-03:00");
const TZ = "America/Argentina/Buenos_Aires";
// El local abre los viernes (dow=5) de 12:00 a 16:00.
const HOURS: BusinessHourSlot[] = [
  { day_of_week: 5, opens_at: "12:00", closes_at: "16:00" },
];

function base() {
  return {
    deliveryType: "pickup" as const,
    paymentMethod: "mp" as const,
    businessHours: HOURS,
    timezone: TZ,
    now: NOW,
  };
}

describe("validateScheduledOrder", () => {
  it("acepta un diferido válido (pickup + MP + dentro de horario y ventana)", () => {
    // Viernes 13:00 AR → dow=5, dentro de 12–16.
    const scheduledAt = new Date("2026-06-26T13:00:00-03:00");
    expect(validateScheduledOrder({ ...base(), scheduledAt })).toEqual({
      ok: true,
    });
  });

  it("rechaza delivery (programar es solo retiro)", () => {
    const scheduledAt = new Date("2026-06-26T13:00:00-03:00");
    const res = validateScheduledOrder({
      ...base(),
      deliveryType: "delivery",
      scheduledAt,
    });
    expect(res.ok).toBe(false);
  });

  it("rechaza efectivo (un programado fuerza Mercado Pago)", () => {
    const scheduledAt = new Date("2026-06-26T13:00:00-03:00");
    const res = validateScheduledOrder({
      ...base(),
      paymentMethod: "cash",
      scheduledAt,
    });
    expect(res.ok).toBe(false);
  });

  it("rechaza un horario fuera del horario de atención", () => {
    // Viernes 18:00 AR → hay franja ese día (12–16) pero 18:00 queda afuera.
    const scheduledAt = new Date("2026-06-26T18:00:00-03:00");
    const res = validateScheduledOrder({ ...base(), scheduledAt });
    expect(res.ok).toBe(false);
  });

  it("rechaza un día sin franja de atención", () => {
    // Jueves siguiente (dow=4): no hay slot configurado.
    const scheduledAt = new Date("2026-07-02T13:00:00-03:00");
    const res = validateScheduledOrder({ ...base(), scheduledAt });
    expect(res.ok).toBe(false);
  });

  it("rechaza menos que la anticipación mínima", () => {
    // 30 min después de NOW (< SCHEDULED_MIN_LEAD_MIN).
    const scheduledAt = new Date(NOW.getTime() + 30 * 60_000);
    const res = validateScheduledOrder({ ...base(), scheduledAt });
    expect(res.ok).toBe(false);
  });

  it("rechaza más allá de la ventana máxima", () => {
    const scheduledAt = new Date(
      NOW.getTime() + (SCHEDULED_MAX_WINDOW_DAYS + 1) * 24 * 60 * 60_000,
    );
    const res = validateScheduledOrder({ ...base(), scheduledAt });
    expect(res.ok).toBe(false);
  });
});

describe("isScheduledForLater", () => {
  const now = new Date("2026-06-25T12:00:00-03:00");

  it("es false sin scheduled_at (pedido para ahora)", () => {
    expect(isScheduledForLater(null, now)).toBe(false);
    expect(isScheduledForLater(undefined, now)).toBe(false);
  });

  it("es true si el instante es futuro", () => {
    expect(isScheduledForLater("2026-06-26T13:00:00-03:00", now)).toBe(true);
  });

  it("es false si el instante ya pasó", () => {
    expect(isScheduledForLater("2026-06-24T13:00:00-03:00", now)).toBe(false);
  });

  it("acepta tanto Date como string ISO", () => {
    expect(
      isScheduledForLater(new Date("2026-06-26T13:00:00-03:00"), now),
    ).toBe(true);
  });
});

describe("shouldMarchNow", () => {
  const scheduledAt = new Date("2026-06-26T13:00:00-03:00");

  it("no marcha mientras falte más que el lead", () => {
    // Falta 41 min (> 40): todavía no.
    const now = new Date("2026-06-26T12:19:00-03:00");
    expect(shouldMarchNow(scheduledAt, now)).toBe(false);
  });

  it("marcha cuando falta exactamente el lead", () => {
    const now = new Date("2026-06-26T12:20:00-03:00");
    expect(shouldMarchNow(scheduledAt, now)).toBe(true);
  });

  it("marcha si ya pasó la hora", () => {
    const now = new Date("2026-06-26T13:30:00-03:00");
    expect(shouldMarchNow(scheduledAt, now)).toBe(true);
  });

  it("respeta un lead custom", () => {
    const now = new Date("2026-06-26T12:30:00-03:00");
    expect(shouldMarchNow(scheduledAt, now, SCHEDULED_MARCH_LEAD_MIN)).toBe(
      true,
    );
    expect(shouldMarchNow(scheduledAt, now, 20)).toBe(false);
  });
});
