import { beforeEach, describe, expect, it, vi } from "vitest";

// Captura las llamadas a createNotification para verificar el ruteo de destinatario.
const calls: Array<Record<string, unknown>> = [];
vi.mock("./create", () => ({
  createNotification: (p: Record<string, unknown>) => {
    calls.push(p);
    return Promise.resolve();
  },
}));

// Estado mutable que el fake service devuelve para orders/tables.
let fakeTableId: string | null = "t1";
let fakeTable: { label: string; mozo_id: string | null } | null = null;

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          if (table === "orders") {
            return Promise.resolve({ data: { table_id: fakeTableId } });
          }
          if (table === "tables") return Promise.resolve({ data: fakeTable });
          return Promise.resolve({ data: null });
        },
      };
    },
  }),
}));

const { notifyItemCancelled } = await import("./events");

describe("notifyItemCancelled (spec 27)", () => {
  beforeEach(() => {
    calls.length = 0;
    fakeTableId = "t1";
    fakeTable = { label: "5", mozo_id: "mozo1" };
  });

  it("actor encargado → notif puntual al mozo de la mesa", async () => {
    await notifyItemCancelled({
      businessId: "b1",
      orderId: "o1",
      reason: "86",
      actorUserId: "enc1",
      actorRole: "encargado",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].userId).toBe("mozo1");
    expect(calls[0].targetRole).toBeUndefined();
    expect(calls[0].actorUserId).toBe("enc1");
    expect((calls[0].payload as { tableLabel: string }).tableLabel).toBe("5");
  });

  it("actor mozo → broadcast a encargado", async () => {
    await notifyItemCancelled({
      businessId: "b1",
      orderId: "o1",
      reason: "86",
      actorUserId: "mozo1",
      actorRole: "mozo",
    });
    expect(calls[0].targetRole).toBe("encargado");
    expect(calls[0].userId).toBeUndefined();
  });

  it("mesa sin mozo asignado → broadcast a encargado", async () => {
    fakeTable = { label: "5", mozo_id: null };
    await notifyItemCancelled({
      businessId: "b1",
      orderId: "o1",
      reason: "86",
      actorUserId: "enc1",
      actorRole: "encargado",
    });
    expect(calls[0].targetRole).toBe("encargado");
  });

  it("pedido sin mesa (delivery) → broadcast a encargado", async () => {
    fakeTableId = null;
    await notifyItemCancelled({
      businessId: "b1",
      orderId: "o1",
      reason: "86",
      actorUserId: "enc1",
      actorRole: "encargado",
    });
    expect(calls[0].targetRole).toBe("encargado");
  });
});
