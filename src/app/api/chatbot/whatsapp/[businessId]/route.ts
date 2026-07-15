import { after, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ChatbotRateLimitedError, runChatbot } from "@/lib/chatbot/agent";
import { ChatbotNotConfiguredError } from "@/lib/chatbot/config-state";
import {
  parseGupshupInbound,
  verifyGupshupToken,
} from "@/lib/notifications/whatsapp-gupshup";
import { sendWhatsapp } from "@/lib/notifications/whatsapp-sender";
import { normalizePhone } from "@/lib/reservations/chatbot-actions";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

// Gupshup NO hace handshake GET (a diferencia de Meta). Healthcheck simple.
export async function GET() {
  return new Response("ok", { status: 200 });
}

/**
 * Webhook entrante de WhatsApp (Gupshup), por negocio (una App = un número = una
 * URL). Autentica por token compartido (Gupshup no firma), deduplica por id de
 * mensaje, ackea 200 rápido y corre el turno del bot en background.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await ctx.params;
  // Cast suelto: `whatsapp_inbound_events` y `webhook_token` viven en migraciones
  // (0006) aún no reflejadas en los tipos generados. Mismo patrón que el sender.
  const service = createSupabaseServiceClient() as unknown as SupabaseClient;

  // 1. Credenciales del negocio: token del webhook + app name (para cross-check).
  const { data: credsData } = await service
    .from("whatsapp_credentials")
    .select("webhook_token, app_name")
    .eq("business_id", businessId)
    .maybeSingle();
  const creds = credsData as {
    webhook_token: string | null;
    app_name: string | null;
  } | null;

  // 2. Auth por token compartido (Gupshup no firma con HMAC). Header
  //    `Authorization: Bearer <token>` o `?token=`. Fail-closed → 401.
  const url = new URL(req.url);
  const authHeader = req.headers.get("authorization");
  const bearer =
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null;
  const provided = bearer ?? url.searchParams.get("token");
  if (!verifyGupshupToken(provided, creds?.webhook_token)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 3. Parsear el envelope propio de Gupshup.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // ping / body no-JSON → ack
  }
  const inbound = parseGupshupInbound(raw);

  // Sólo el texto dispara el bot; media / message-event / user-event → ack y descarte.
  if (inbound.kind !== "text") {
    return NextResponse.json({ ok: true, skipped: inbound.kind });
  }

  // Cross-check defensivo: el `app` del payload debe ser el del negocio de la URL.
  if (inbound.app && creds?.app_name && inbound.app !== creds.app_name) {
    console.warn("whatsapp webhook: app mismatch", { businessId });
    return NextResponse.json({ ok: true, skipped: "app-mismatch" });
  }

  // 4. Idempotencia: Gupshup reintenta si no ackeamos 2xx a tiempo.
  const { error: dupErr } = await service
    .from("whatsapp_inbound_events")
    .insert({
      business_id: businessId,
      provider: "gupshup",
      provider_event_id: inbound.providerEventId,
      type: "message",
    });
  if (dupErr) {
    // 23505 (unique_violation) u otro → tratamos como ya procesado; ack sin reprocesar.
    return NextResponse.json({ ok: true, skipped: "duplicate" });
  }

  // 5. Resolver slug + nombre del negocio para el agente.
  const { data: bizData } = await service
    .from("businesses")
    .select("slug, name")
    .eq("id", businessId)
    .maybeSingle();
  const business = bizData as { slug: string | null; name: string | null } | null;
  if (!business?.slug) {
    return NextResponse.json({ ok: true, skipped: "no-business" });
  }

  // 6. Ack rápido + turno en background (presupuesto <10s de Gupshup). Si el
  //    turno falla, es best-effort: Gupshup ya recibió el 200 y no reintenta.
  //    Handoff (spec 32): `runChatbot` chequea `chatbot_conversations.agent_enabled`
  //    y, si el staff apagó el agente, persiste el entrante y devuelve
  //    `assistantMessage` vacío → no se manda respuesta (el `.trim()` de abajo).
  const businessSlug = business.slug;
  const businessName = business.name ?? businessSlug;
  const contactIdentifier = normalizePhone(inbound.phone);
  const contactDisplayName = inbound.name ?? undefined;
  const toPhone = inbound.phone;
  const userMessage = inbound.text;

  after(async () => {
    try {
      const result = await runChatbot({
        businessId,
        businessSlug,
        businessName,
        channel: "whatsapp",
        contactIdentifier,
        contactDisplayName,
        userMessage,
      });
      if (result.assistantMessage?.trim()) {
        await sendWhatsapp({
          businessId,
          to: toPhone,
          text: result.assistantMessage,
        });
      }
    } catch (err) {
      // Rate-limit: ackear y no responder (no spamear de vuelta).
      if (err instanceof ChatbotRateLimitedError) return;
      if (err instanceof ChatbotNotConfiguredError) {
        console.warn("whatsapp webhook: chatbot no configurado", { businessId });
        return;
      }
      console.error("whatsapp webhook: el turno del bot falló", err);
    }
  });

  return NextResponse.json({ ok: true });
}
