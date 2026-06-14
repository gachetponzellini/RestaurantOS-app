import { NextResponse } from "next/server";

import { ensureAdminAccess } from "@/lib/admin/context";
import { closeConversation, runChatbot } from "@/lib/chatbot/agent";
import { ChatbotNotConfiguredError } from "@/lib/chatbot/config-state";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: {
    businessSlug?: string;
    contactIdentifier?: string;
    message?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { businessSlug, contactIdentifier, message } = body;
  if (!businessSlug || !contactIdentifier || !message?.trim()) {
    return NextResponse.json(
      { error: "businessSlug, contactIdentifier and message are required" },
      { status: 400 },
    );
  }

  const business = await getBusiness(businessSlug);
  if (!business) {
    return NextResponse.json({ error: "business not found" }, { status: 404 });
  }

  await ensureAdminAccess(business.id, businessSlug);

  try {
    const result = await runChatbot({
      businessId: business.id,
      businessSlug,
      businessName: business.name,
      channel: "web-test",
      contactIdentifier: contactIdentifier.trim(),
      userMessage: message,
    });
    // result already includes { conversationId, assistantMessage, toolTrace }
    return NextResponse.json(result);
  } catch (err) {
    // El bot no está configurado (falta API key o está deshabilitado): mensaje
    // accionable + 409, distinguible de un fallo genérico del modelo. Nunca
    // exponemos la key (el error tipado ya trae un mensaje seguro).
    if (err instanceof ChatbotNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, reason: err.reason, chatbotReady: false },
        { status: 409 },
      );
    }
    console.error("chatbot test POST failed", err);
    const msg = err instanceof Error ? err.message : "chatbot failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const businessSlug = url.searchParams.get("businessSlug");
  const conversationId = url.searchParams.get("conversationId");
  if (!businessSlug || !conversationId) {
    return NextResponse.json(
      { error: "businessSlug and conversationId are required" },
      { status: 400 },
    );
  }

  const business = await getBusiness(businessSlug);
  if (!business) {
    return NextResponse.json({ error: "business not found" }, { status: 404 });
  }

  await ensureAdminAccess(business.id, businessSlug);

  // Validate the conversation belongs to this business before closing.
  const service = createSupabaseServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: conv } = await (service as any)
    .from("chatbot_conversations")
    .select("id, business_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || conv.business_id !== business.id) {
    return NextResponse.json(
      { error: "conversation not found" },
      { status: 404 },
    );
  }

  try {
    await closeConversation(conversationId, business.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("chatbot test DELETE failed", err);
    const msg = err instanceof Error ? err.message : "close failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
