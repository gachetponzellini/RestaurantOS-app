import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationPreference } from "./preferences";

// Fake del service client: captura inserts y devuelve `prefs` para la lectura
// de notification_preferences. Cubre el ruteo de createNotification sin DB.
type Captured = {
  notifications: Record<string, unknown>[];
  whatsapp_outbox: Record<string, unknown>[];
};

function makeFakeService(opts: {
  prefs?: NotificationPreference[];
  failNotificationInsert?: boolean;
}) {
  const captured: Captured = { notifications: [], whatsapp_outbox: [] };
  const prefs = opts.prefs ?? [];
  const client = {
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        is() {
          return this;
        },
        // Hace al builder awaitable: `await ...select().eq().eq()` → {data: prefs}.
        then(resolve: (v: { data: unknown; error: null }) => void) {
          resolve({ data: prefs, error: null });
        },
        async insert(row: Record<string, unknown>) {
          if (table === "notifications" && opts.failNotificationInsert) {
            return { error: { message: "boom" } };
          }
          captured[table as keyof Captured]?.push(row);
          return { error: null };
        },
      };
    },
  };
  return { client, captured };
}

let currentFake = makeFakeService({});

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => currentFake.client,
}));

const { createNotification } = await import("./create");

function pref(
  p: Partial<NotificationPreference> &
    Pick<NotificationPreference, "event_type" | "channel">,
): NotificationPreference {
  return { target_role: null, target_user_id: null, enabled: true, ...p };
}

describe("createNotification (ruteo por preferencias)", () => {
  beforeEach(() => {
    currentFake = makeFakeService({});
  });

  it("sin preferencias inserta in_app y no encola WhatsApp (back-compat)", async () => {
    currentFake = makeFakeService({ prefs: [] });
    await createNotification({
      businessId: "b1",
      targetRole: "encargado",
      type: "order.pending",
      payload: { orderNumber: 7 },
    });
    expect(currentFake.captured.notifications).toHaveLength(1);
    expect(currentFake.captured.whatsapp_outbox).toHaveLength(0);
  });

  it("con canal whatsapp activo encola en el outbox", async () => {
    currentFake = makeFakeService({
      prefs: [
        pref({
          event_type: "order.pending",
          target_role: "encargado",
          channel: "whatsapp",
        }),
      ],
    });
    await createNotification({
      businessId: "b1",
      targetRole: "encargado",
      type: "order.pending",
      payload: {},
    });
    expect(currentFake.captured.whatsapp_outbox).toHaveLength(1);
    // Notif interna sin teléfono del empleado → queda en failed con motivo, sin
    // romper nada (el WhatsApp al personal requiere su teléfono — cambio futuro).
    expect(currentFake.captured.whatsapp_outbox[0].status).toBe("failed");
    expect(String(currentFake.captured.whatsapp_outbox[0].error)).toContain(
      "Sin teléfono destino",
    );
  });

  it("con in_app desactivado no inserta la notificación in-app", async () => {
    currentFake = makeFakeService({
      prefs: [
        pref({
          event_type: "order.pending",
          target_role: "encargado",
          channel: "in_app",
          enabled: false,
        }),
      ],
    });
    await createNotification({
      businessId: "b1",
      targetRole: "encargado",
      type: "order.pending",
      payload: {},
    });
    expect(currentFake.captured.notifications).toHaveLength(0);
  });

  it("es best-effort: no lanza si el insert in-app falla", async () => {
    currentFake = makeFakeService({ failNotificationInsert: true });
    await expect(
      createNotification({
        businessId: "b1",
        targetRole: "encargado",
        type: "order.pending",
        payload: {},
      }),
    ).resolves.toBeUndefined();
  });

  // ── Principio "no notificar al actor" (spec 27) ──────────────────────
  it("omite la notif si el destinatario puntual es el propio actor", async () => {
    currentFake = makeFakeService({ prefs: [] });
    await createNotification({
      businessId: "b1",
      userId: "u1",
      actorUserId: "u1",
      type: "mesa.cancelled",
      payload: {},
    });
    expect(currentFake.captured.notifications).toHaveLength(0);
    expect(currentFake.captured.whatsapp_outbox).toHaveLength(0);
  });

  it("crea la notif si el destinatario puntual no es el actor", async () => {
    currentFake = makeFakeService({ prefs: [] });
    await createNotification({
      businessId: "b1",
      userId: "u1",
      actorUserId: "u2",
      type: "mesa.cancelled",
      payload: {},
    });
    expect(currentFake.captured.notifications).toHaveLength(1);
  });

  it("no excluye al actor en broadcasts por rol (limitación del modelo)", async () => {
    currentFake = makeFakeService({ prefs: [] });
    await createNotification({
      businessId: "b1",
      targetRole: "encargado",
      actorUserId: "u1",
      type: "mesa.cancelled",
      payload: {},
    });
    expect(currentFake.captured.notifications).toHaveLength(1);
  });
});
