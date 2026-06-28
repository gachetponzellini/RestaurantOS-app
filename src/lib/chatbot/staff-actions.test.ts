import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BusinessRole } from "@/lib/admin/context";

// ── Estado mutable de los fakes (se resetea en beforeEach) ───────────────
// Cubre el gate de permisos (canManageConversations), la regla "no se pisan"
// (agente ON → rechazo), la ventana de 24 h y el marcado de autor en metadata.
// La lógica pura de la ventana vive en staff-window.test.ts.

const NOW = Date.now();
const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

let role: BusinessRole = "encargado";
let isPlatform = false;

type Conv = {
  id: string;
  business_id: string;
  contact_id: string;
  agent_enabled: boolean;
};
let conversation: Conv;
let contact: { id: string; business_id: string; identifier: string; channel: string };
let messages: { conversation_id: string; role: string; created_at: string }[];

let sendResult: { ok: boolean; sent_at?: string; messageId?: string | null; error?: string };
const sendCalls: Array<{ businessId: string; to: string; text?: string }> = [];
const inserted: Array<{ table: string; row: Record<string, unknown> }> = [];
const updates: Array<{ table: string; row: Record<string, unknown>; id?: string }> = [];
const runChatbotCalls: unknown[] = [];

function reset() {
  role = "encargado";
  isPlatform = false;
  conversation = {
    id: "c1",
    business_id: "biz1",
    contact_id: "ct1",
    agent_enabled: false,
  };
  contact = {
    id: "ct1",
    business_id: "biz1",
    identifier: "5491133334444",
    channel: "whatsapp",
  };
  messages = [{ conversation_id: "c1", role: "user", created_at: ago(2 * HOUR) }];
  sendResult = { ok: true, sent_at: ago(0), messageId: "wamid.1" };
  sendCalls.length = 0;
  inserted.length = 0;
  updates.length = 0;
  runChatbotCalls.length = 0;
}

function tableRows(table: string): Record<string, unknown>[] {
  switch (table) {
    case "chatbot_conversations":
      return [conversation];
    case "chatbot_contacts":
      return [contact];
    case "chatbot_messages":
      return messages;
    case "users":
      return [{ id: "u1", full_name: "Encargado Test" }];
    default:
      return [];
  }
}

// Query awaitable + chainable mínimo (eq/in/order/limit/maybeSingle/await).
function makeQuery(initial: Record<string, unknown>[]) {
  let rows = [...initial];
  const api: Record<string, unknown> = {
    eq(col: string, val: unknown) {
      rows = rows.filter((r) => r[col] === val);
      return api;
    },
    in(col: string, vals: unknown[]) {
      rows = rows.filter((r) => vals.includes(r[col]));
      return api;
    },
    order(col: string, opts?: { ascending?: boolean }) {
      const asc = opts?.ascending !== false;
      rows = [...rows].sort((a, b) => {
        const av = String(a[col]);
        const bv = String(b[col]);
        return asc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
      return api;
    },
    limit(n: number) {
      rows = rows.slice(0, n);
      return api;
    },
    maybeSingle() {
      return Promise.resolve({ data: rows[0] ?? null, error: null });
    },
    then(resolve: (v: { data: unknown[]; error: null }) => void) {
      resolve({ data: rows, error: null });
    },
  };
  return api;
}

function makeService() {
  return {
    from(table: string) {
      return {
        select: () => makeQuery(tableRows(table)),
        insert: (row: Record<string, unknown>) => {
          inserted.push({ table, row });
          return Promise.resolve({ data: null, error: null });
        },
        update: (row: Record<string, unknown>) => ({
          eq: (col: string, val: unknown) => {
            updates.push({ table, row, [col]: val } as never);
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  };
}

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

vi.mock("@/lib/tenant", () => ({
  getBusiness: async (slug: string) => ({ id: "biz1", slug }),
}));

vi.mock("@/lib/mozo/auth", () => ({
  requireMozoActionContext: async () => ({
    ok: true,
    data: { userId: "u1", role, isPlatformAdmin: isPlatform },
  }),
}));

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => makeService(),
}));

vi.mock("@/lib/notifications/whatsapp-sender", () => ({
  sendWhatsapp: async (params: { businessId: string; to: string; text?: string }) => {
    sendCalls.push(params);
    return sendResult;
  },
}));

// Guarda defensiva: la escritura manual NUNCA debe invocar el LLM.
vi.mock("@/lib/chatbot/agent", () => ({
  runChatbot: async (...args: unknown[]) => {
    runChatbotCalls.push(args);
    return { conversationId: "c1", assistantMessage: "no debería", toolTrace: [] };
  },
}));

const { toggleConversationAgent, sendStaffMessage } = await import(
  "./staff-actions"
);

describe("toggleConversationAgent", () => {
  beforeEach(reset);

  it("encargado apaga el agente → persiste agent_enabled=false (R1.2)", async () => {
    conversation.agent_enabled = true;
    const r = await toggleConversationAgent("house", "c1", false);
    expect(r.ok).toBe(true);
    const upd = updates.find((u) => u.table === "chatbot_conversations");
    expect(upd?.row).toMatchObject({ agent_enabled: false });
    expect(upd?.id).toBe("c1");
  });

  it("admin reactiva el agente → persiste agent_enabled=true", async () => {
    role = "admin";
    const r = await toggleConversationAgent("house", "c1", true);
    expect(r.ok).toBe(true);
    expect(updates[0]?.row).toMatchObject({ agent_enabled: true });
  });

  it("mozo → rechazado, no persiste (R1.3)", async () => {
    role = "mozo";
    const r = await toggleConversationAgent("house", "c1", false);
    expect(r.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("conversación de otro negocio → rechazado (cross-tenant)", async () => {
    conversation.business_id = "otra-biz";
    const r = await toggleConversationAgent("house", "c1", false);
    expect(r.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });
});

describe("sendStaffMessage", () => {
  beforeEach(reset);

  it("agente OFF + ventana abierta → envía por WhatsApp y persiste con autor staff (R3.1, R3.2)", async () => {
    const r = await sendStaffMessage("house", "c1", "Hola, te atiendo yo 👋");
    expect(r.ok).toBe(true);

    // Envío directo por el sender 360dialog, al identifier del contacto.
    expect(sendCalls).toHaveLength(1);
    expect(sendCalls[0]).toMatchObject({
      businessId: "biz1",
      to: "5491133334444",
      text: "Hola, te atiendo yo 👋",
    });

    // Persistido como assistant + metadata.sent_by='staff' (+ usuario).
    const msg = inserted.find((i) => i.table === "chatbot_messages");
    expect(msg?.row).toMatchObject({
      conversation_id: "c1",
      role: "assistant",
      content: "Hola, te atiendo yo 👋",
    });
    const meta = msg?.row.metadata as Record<string, unknown>;
    expect(meta.sent_by).toBe("staff");
    expect(meta.user_id).toBe("u1");
  });

  it("NO invoca el LLM (R3.3)", async () => {
    await sendStaffMessage("house", "c1", "mensaje directo");
    expect(runChatbotCalls).toHaveLength(0);
  });

  it("bumpea updated_at de la conversación tras enviar", async () => {
    await sendStaffMessage("house", "c1", "hola");
    const upd = updates.find((u) => u.table === "chatbot_conversations");
    expect(upd?.row).toHaveProperty("updated_at");
  });

  it("agente ON → rechazado, no envía ni persiste (R2.2)", async () => {
    conversation.agent_enabled = true;
    const r = await sendStaffMessage("house", "c1", "hola");
    expect(r.ok).toBe(false);
    expect(sendCalls).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });

  it("ventana de 24 h vencida → rechazado, no envía ni persiste (R4.2)", async () => {
    messages = [{ conversation_id: "c1", role: "user", created_at: ago(25 * HOUR) }];
    const r = await sendStaffMessage("house", "c1", "hola");
    expect(r.ok).toBe(false);
    expect(sendCalls).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });

  it("sin ningún mensaje entrante del cliente → ventana cerrada, rechazado (R4.3)", async () => {
    messages = [{ conversation_id: "c1", role: "assistant", created_at: ago(1 * HOUR) }];
    const r = await sendStaffMessage("house", "c1", "hola");
    expect(r.ok).toBe(false);
    expect(sendCalls).toHaveLength(0);
  });

  it("mozo → rechazado por permiso (R1.3)", async () => {
    role = "mozo";
    const r = await sendStaffMessage("house", "c1", "hola");
    expect(r.ok).toBe(false);
    expect(sendCalls).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });

  it("texto vacío → rechazado sin tocar la red", async () => {
    const r = await sendStaffMessage("house", "c1", "   ");
    expect(r.ok).toBe(false);
    expect(sendCalls).toHaveLength(0);
    expect(inserted).toHaveLength(0);
  });

  it("si el envío por WhatsApp falla → error y NO persiste el mensaje", async () => {
    sendResult = { ok: false, error: "WhatsApp no conectado." };
    const r = await sendStaffMessage("house", "c1", "hola");
    expect(r.ok).toBe(false);
    expect(inserted).toHaveLength(0);
  });
});
