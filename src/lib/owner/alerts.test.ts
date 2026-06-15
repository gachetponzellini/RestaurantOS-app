import { describe, expect, it } from "vitest";

import { buildAlerts, type LocalAlertInput } from "./alerts";

const ok: LocalAlertInput = {
  name: "House",
  revenuePct: 5,
  kitchenAvgMin: 18,
  kitchenSample: 50,
  noShow: 0,
  attendanceRate: 95,
  reservationsFinalized: 20,
};

describe("buildAlerts", () => {
  it("un local sano no genera alertas", () => {
    expect(buildAlerts([ok])).toEqual([]);
  });

  it("avisa caída de ventas ≥15%", () => {
    const alerts = buildAlerts([{ ...ok, name: "Golf", revenuePct: -22 }]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.kind).toBe("revenue_drop");
    expect(alerts[0]!.message).toContain("22%");
  });

  it("una caída menor a 15% no avisa", () => {
    expect(buildAlerts([{ ...ok, revenuePct: -10 }])).toEqual([]);
  });

  it("sin base previa (pct null) no avisa caída", () => {
    expect(buildAlerts([{ ...ok, revenuePct: null }])).toEqual([]);
  });

  it("avisa cocina lenta solo con muestra suficiente", () => {
    expect(buildAlerts([{ ...ok, kitchenAvgMin: 40, kitchenSample: 5 }])).toEqual(
      [],
    );
    const alerts = buildAlerts([
      { ...ok, kitchenAvgMin: 40, kitchenSample: 30 },
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.kind).toBe("kitchen_slow");
  });

  it("avisa baja asistencia de reservas con muestra suficiente", () => {
    const alerts = buildAlerts([
      { ...ok, attendanceRate: 60, noShow: 8, reservationsFinalized: 20 },
    ]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.kind).toBe("no_shows");
    expect(alerts[0]!.message).toContain("8 no-shows");
  });

  it("pocas reservas no disparan alerta de asistencia", () => {
    expect(
      buildAlerts([
        { ...ok, attendanceRate: 40, noShow: 1, reservationsFinalized: 2 },
      ]),
    ).toEqual([]);
  });

  it("acumula varias alertas de varios locales", () => {
    const alerts = buildAlerts([
      { ...ok, name: "House", revenuePct: -30 },
      { ...ok, name: "Golf", kitchenAvgMin: 50, kitchenSample: 40 },
    ]);
    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.localName)).toEqual(["House", "Golf"]);
  });
});
