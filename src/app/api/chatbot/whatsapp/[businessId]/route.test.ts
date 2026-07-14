import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Estado controlable por los mocks ────────────────────────────────────────
let credsRow: { webhook_token: string | null; app_name: string | null } | null = {
  webhook_token: "s3cr3t-token",
  app_name: "GolfHouse",
};
let businessRow: { slug: string | null; name: string | null } | null = {
  slug: "golf",
  name: "Golf",
};
let insertError: { code: string } | null = null;

// `after` corre post-respuesta; acá coleccionamos los callbacks para dispararlos
// manualmente y poder asertar el turno del bot.
const afterCbs: Array<() => unknown> = [];

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (cb: () => unknown) => afterCbs.push(cb) };
});

vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    from: (table: string) => {
      if (table === "whatsapp_inbound_events") {
        return { insert: async () => ({ error: insertError }) };
      }
      const row = table === "whatsapp_credentials" ? credsRow : businessRow;
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
        }),
      };
    },
  }),
}));

const runChatbot = vi.fn(async (_input: Record<string, unknown>) => ({
  conversationId: "c1",
  assistantMessage: "¡Hola! ¿Querés reservar?",
  toolTrace: [],
}));
class ChatbotRateLimitedError extends Error {}
vi.mock("@/lib/chatbot/agent", () => ({ runChatbot, ChatbotRateLimitedError }));

class ChatbotNotConfiguredError extends Error {}
vi.mock("@/lib/chatbot/config-state", () => ({ ChatbotNotConfiguredError }));

const sendWhatsapp = vi.fn(async () => ({
  ok: true,
  sent_at: "now",
  messageId: "m1",
}));
vi.mock("@/lib/notifications/whatsapp-sender", () => ({ sendWhatsapp }));

vi.mock("@/lib/reservations/chatbot-actions", () => ({
  normalizePhone: (s: string) => s.replace(/\D/g, ""),
}));

const { POST } = await import("./route");

function textEnvelope() {
  return {
    app: "GolfHouse",
    type: "message",
    payload: {
      id: "MSG-1",
      source: "5491122334455",
      type: "text",
      payload: { text: "Hola, quiero reservar" },
      sender: { phone: "5491122334455", name: "Ana" },
    },
  };
}

function makeReq(body: unknown, token = "s3cr3t-token") {
  return new Request(
    `https://x/api/chatbot/whatsapp/b1?token=${encodeURIComponent(token)}`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

const ctx = { params: Promise.resolve({ businessId: "b1" }) };

async function runAfters() {
  for (const cb of afterCbs) await cb();
}

beforeEach(() => {
  credsRow = { webhook_token: "s3cr3t-token", app_name: "GolfHouse" };
  businessRow = { slug: "golf", name: "Golf" };
  insertError = null;
  afterCbs.length = 0;
  runChatbot.mockClear();
  sendWhatsapp.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/chatbot/whatsapp/[businessId]", () => {
  it("texto con token válido → 200, corre el bot y responde por WhatsApp", async () => {
    const res = await POST(makeReq(textEnvelope()), ctx);
    expect(res.status).toBe(200);
    await runAfters();
    expect(runChatbot).toHaveBeenCalledOnce();
    const arg = runChatbot.mock.calls[0]![0] as Record<string, unknown>;
    expect(arg.channel).toBe("whatsapp");
    expect(arg.contactIdentifier).toBe("5491122334455");
    expect(arg.userMessage).toBe("Hola, quiero reservar");
    expect(sendWhatsapp).toHaveBeenCalledOnce();
  });

  it("token inválido → 401 y no corre el bot", async () => {
    const res = await POST(makeReq(textEnvelope(), "wrong"), ctx);
    expect(res.status).toBe(401);
    await runAfters();
    expect(runChatbot).not.toHaveBeenCalled();
  });

  it("mensaje duplicado (unique_violation) → 200 sin reprocesar", async () => {
    insertError = { code: "23505" };
    const res = await POST(makeReq(textEnvelope()), ctx);
    expect(res.status).toBe(200);
    await runAfters();
    expect(runChatbot).not.toHaveBeenCalled();
  });

  it("media → 200 y no corre el bot (fase 1 no procesa media)", async () => {
    const media = {
      app: "GolfHouse",
      type: "message",
      payload: {
        id: "IMG-1",
        source: "5491122334455",
        type: "image",
        payload: { url: "https://filemanager.gupshup.io/x.jpg" },
        sender: { phone: "5491122334455" },
      },
    };
    const res = await POST(makeReq(media), ctx);
    expect(res.status).toBe(200);
    await runAfters();
    expect(runChatbot).not.toHaveBeenCalled();
  });

  it("message-event (DLR) → 200 y no corre el bot", async () => {
    const res = await POST(
      makeReq({ app: "GolfHouse", type: "message-event", payload: {} }),
      ctx,
    );
    expect(res.status).toBe(200);
    await runAfters();
    expect(runChatbot).not.toHaveBeenCalled();
  });
});
