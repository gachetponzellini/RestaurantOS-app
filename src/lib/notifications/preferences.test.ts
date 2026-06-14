import { describe, expect, it } from "vitest";

import {
  type NotificationPreference,
  resolveChannels,
} from "./preferences";

function pref(
  partial: Partial<NotificationPreference> &
    Pick<NotificationPreference, "event_type" | "channel">,
): NotificationPreference {
  return {
    target_role: null,
    target_user_id: null,
    enabled: true,
    ...partial,
  };
}

describe("resolveChannels", () => {
  it("sin preferencias devuelve in_app (back-compat con el ruteo actual)", () => {
    expect(resolveChannels([], "order.pending", { role: "encargado" })).toEqual([
      "in_app",
    ]);
  });

  it("una preferencia que apaga in_app deja al destinatario sin ese aviso", () => {
    const prefs = [
      pref({
        event_type: "order.pending",
        target_role: "encargado",
        channel: "in_app",
        enabled: false,
      }),
    ];
    expect(resolveChannels(prefs, "order.pending", { role: "encargado" })).toEqual(
      [],
    );
  });

  it("combina in_app + whatsapp cuando ambos canales están activos", () => {
    const prefs = [
      pref({ event_type: "order.pending", target_role: "encargado", channel: "in_app" }),
      pref({ event_type: "order.pending", target_role: "encargado", channel: "whatsapp" }),
    ];
    expect(
      resolveChannels(prefs, "order.pending", { role: "encargado" }).sort(),
    ).toEqual(["in_app", "whatsapp"]);
  });

  it("una preferencia de otro rol no afecta al destinatario natural", () => {
    const prefs = [
      pref({
        event_type: "order.pending",
        target_role: "mozo",
        channel: "in_app",
        enabled: false,
      }),
    ];
    // El encargado no tiene pref propia → cae al default in_app.
    expect(resolveChannels(prefs, "order.pending", { role: "encargado" })).toEqual([
      "in_app",
    ]);
  });

  it("matchea preferencias dirigidas a un usuario puntual por user_id", () => {
    const prefs = [
      pref({
        event_type: "comanda.entregada",
        target_user_id: "user-1",
        channel: "whatsapp",
      }),
    ];
    expect(
      resolveChannels(prefs, "comanda.entregada", { userId: "user-1" }),
    ).toEqual(["whatsapp"]);
    // Otro usuario sin pref → default in_app.
    expect(
      resolveChannels(prefs, "comanda.entregada", { userId: "user-2" }),
    ).toEqual(["in_app"]);
  });

  it("una preferencia de otro evento no se mezcla", () => {
    const prefs = [
      pref({
        event_type: "mesa.cancelled",
        target_role: "encargado",
        channel: "whatsapp",
      }),
    ];
    expect(resolveChannels(prefs, "order.pending", { role: "encargado" })).toEqual([
      "in_app",
    ]);
  });

  it("deduplica canales repetidos", () => {
    const prefs = [
      pref({ event_type: "order.pending", target_role: "encargado", channel: "in_app" }),
      pref({ event_type: "order.pending", target_role: "encargado", channel: "in_app" }),
    ];
    expect(resolveChannels(prefs, "order.pending", { role: "encargado" })).toEqual([
      "in_app",
    ]);
  });
});
