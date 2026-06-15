// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbAvailable = Boolean(url && key);

// Sonda: si la tabla no responde (DB no disponible), skipeamos el suite.
async function probe(): Promise<boolean> {
  if (!dbAvailable) return false;
  const c = createClient(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.from("chatbot_conversations").select("id").limit(1);
  return !error;
}
const ready = await probe();

describe.skipIf(!ready)(
  "chatbot: una conversación abierta por contacto (integration, mig 0068)",
  () => {
    const db = createClient(url!, key!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    let businessId = "";
    let contactId = "";
    const createdConvIds: string[] = [];

    beforeAll(async () => {
      const { data: biz } = await db
        .from("businesses")
        .select("id")
        .limit(1)
        .single();
      businessId = (biz as { id: string }).id;

      const { data: contact } = await db
        .from("chatbot_contacts")
        .insert({
          business_id: businessId,
          channel: "web-test",
          identifier: `test-oneopen-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
        })
        .select("id")
        .single();
      contactId = (contact as { id: string }).id;
    });

    afterAll(async () => {
      if (createdConvIds.length) {
        await db.from("chatbot_conversations").delete().in("id", createdConvIds);
      }
      if (contactId) {
        await db.from("chatbot_contacts").delete().eq("id", contactId);
      }
    });

    it("la 2ª conversación abierta del mismo contacto es rechazada (23505)", async () => {
      const first = await db
        .from("chatbot_conversations")
        .insert({ business_id: businessId, contact_id: contactId })
        .select("id")
        .single();
      expect(first.error).toBeNull();
      if (first.data) createdConvIds.push((first.data as { id: string }).id);

      const second = await db
        .from("chatbot_conversations")
        .insert({ business_id: businessId, contact_id: contactId })
        .select("id")
        .single();
      expect(second.error).not.toBeNull();
      expect(second.error?.code).toBe("23505");
      if (second.data) createdConvIds.push((second.data as { id: string }).id);
    });

    it("tras cerrar la abierta, se puede abrir otra", async () => {
      await db
        .from("chatbot_conversations")
        .update({ closed_at: new Date().toISOString() })
        .eq("contact_id", contactId)
        .is("closed_at", null);

      const reopened = await db
        .from("chatbot_conversations")
        .insert({ business_id: businessId, contact_id: contactId })
        .select("id")
        .single();
      expect(reopened.error).toBeNull();
      if (reopened.data)
        createdConvIds.push((reopened.data as { id: string }).id);
    });
  },
);
