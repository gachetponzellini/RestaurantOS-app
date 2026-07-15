// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { runChatbot } from "./agent";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbAvailable = Boolean(url && key);

async function probe(): Promise<boolean> {
  if (!dbAvailable) return false;
  const c = createClient(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.from("chatbot_conversations").select("id").limit(1);
  return !error;
}
const ready = await probe();

// Handoff humano (spec 32): con `agent_enabled=false`, `runChatbot` debe
// persistir el mensaje entrante (para que el humano lo vea en la bandeja) y NO
// invocar al LLM. Usamos el canal `web-test` para saltear el rate-limit; el gate
// es channel-agnóstico. La API key es un dummy: como el gate corta ANTES de
// invocar al modelo, nunca se usa de verdad (si el gate estuviera roto, el
// intento de llamar al modelo con la key dummy haría fallar el test — señal).
describe.skipIf(!ready)("chatbot handoff: agente OFF no invoca al LLM (spec 32)", () => {
  const db = createClient(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const TAG = `test-handoff-${Date.now()}`;
  const identifier = `handoff-${Date.now()}`;
  let businessId = "";
  let conversationId = "";
  let originalKey: string | undefined;

  beforeAll(async () => {
    originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-dummy-handoff-test";

    const { data: biz } = await db
      .from("businesses")
      .insert({ slug: TAG, name: "Handoff Test", is_active: true })
      .select("id")
      .single();
    businessId = (biz as { id: string }).id;

    // El bot debe estar "listo" (habilitado + key) para llegar al gate.
    await db
      .from("chatbot_configs")
      .insert({ business_id: businessId, chatbot_enabled: true });

    const { data: contact } = await db
      .from("chatbot_contacts")
      .insert({ business_id: businessId, channel: "web-test", identifier })
      .select("id")
      .single();
    const contactId = (contact as { id: string }).id;

    // Conversación con el agente APAGADO (el staff la está atendiendo).
    const { data: conv } = await db
      .from("chatbot_conversations")
      .insert({
        business_id: businessId,
        contact_id: contactId,
        agent_enabled: false,
      })
      .select("id")
      .single();
    conversationId = (conv as { id: string }).id;
  });

  afterAll(async () => {
    if (businessId) await db.from("businesses").delete().eq("id", businessId);
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it("agent_enabled=false → persiste el entrante y devuelve respuesta vacía (sin LLM)", { timeout: 30_000 }, async () => {
    const result = await runChatbot({
      businessId,
      businessSlug: TAG,
      businessName: "Handoff Test",
      channel: "web-test",
      contactIdentifier: identifier,
      userMessage: "hola, quiero una mesa para 4",
    });

    // Bot silencioso: sin respuesta (el webhook no manda nada con "".trim()).
    expect(result.assistantMessage).toBe("");
    expect(result.conversationId).toBe(conversationId);

    // El entrante quedó persistido (visible en la bandeja) y NO hay respuesta
    // del bot en el hilo.
    const { data: msgs } = await db
      .from("chatbot_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .order("created_at");
    expect(msgs).toHaveLength(1);
    expect(msgs![0].role).toBe("user");
    expect(msgs![0].content).toBe("hola, quiero una mesa para 4");
  });
});
