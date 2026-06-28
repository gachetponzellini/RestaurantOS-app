"use server";

// Server actions de la bandeja de conversaciones (spec 32) — handoff humano.
//
// Dos operaciones de supervisión sobre una conversación del chatbot:
//   · toggleConversationAgent → prende/apaga el bot por conversación (handoff).
//   · sendStaffMessage        → el staff le escribe al cliente como humano.
//
// CONTRATO PARA EL WEBHOOK ENTRANTE (cambio futuro, NO se implementa acá):
// el webhook `POST /api/chatbot/whatsapp` debe leer `chatbot_conversations.
// agent_enabled` ANTES de invocar el LLM. Si es `false`, persiste el mensaje
// entrante del cliente (`role: 'user'`) pero **NO** corre `runChatbot` — la
// conversación la está atendiendo un humano. Así bot y humano nunca contestan
// el mismo turno (spec 32 · R6 / D3).

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { requireMozoActionContext } from "@/lib/mozo/auth";
import { canManageConversations } from "@/lib/permissions/can";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

import { sendWhatsapp } from "@/lib/notifications/whatsapp-sender";
import { isWindowOpen, lastInboundAt } from "./staff-window";

type GenericClient = SupabaseClient;

/** Mensaje saliente del staff, tal como queda en el hilo. Para append optimista. */
export type StaffMessage = {
  role: "assistant";
  content: string;
  created_at: string;
  sent_by: "staff";
};

type ScopedConversation = {
  id: string;
  business_id: string;
  contact_id: string;
  agent_enabled: boolean;
};

/**
 * Carga una conversación validando que pertenece al negocio (defensa
 * cross-tenant: el id viene del cliente). Devuelve `null` si no existe o es de
 * otro negocio.
 */
async function loadConversationScoped(
  service: GenericClient,
  conversationId: string,
  businessId: string,
): Promise<ScopedConversation | null> {
  const { data } = await service
    .from("chatbot_conversations")
    .select("id, business_id, contact_id, agent_enabled")
    .eq("id", conversationId)
    .maybeSingle();
  const conv = data as ScopedConversation | null;
  if (!conv || conv.business_id !== businessId) return null;
  return conv;
}

/**
 * Prende/apaga el agente (bot) para una conversación — el handoff. `false` =
 * "lo atiendo yo". Sólo admin/encargado. Scopeado por negocio.
 */
export async function toggleConversationAgent(
  businessSlug: string,
  conversationId: string,
  enabled: boolean,
): Promise<ActionResult<{ agent_enabled: boolean }>> {
  const business = await getBusiness(businessSlug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  if (!canManageConversations(ctxResult.data.role)) {
    return actionError("No tenés permisos para gestionar conversaciones.");
  }

  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const conv = await loadConversationScoped(service, conversationId, business.id);
  if (!conv) return actionError("Conversación no encontrada.");

  const { error } = await service
    .from("chatbot_conversations")
    .update({ agent_enabled: enabled })
    .eq("id", conversationId);
  if (error) {
    console.error("toggleConversationAgent", error);
    return actionError("No pudimos cambiar el estado del agente.");
  }

  revalidatePath(`/${businessSlug}/admin/conversaciones/${conversationId}`);
  revalidatePath(`/${businessSlug}/admin/conversaciones`);
  return actionOk({ agent_enabled: enabled });
}

const SendStaffMessageInput = z.object({
  text: z.string().trim().min(1, "El mensaje no puede estar vacío.").max(4096),
});

/**
 * Le escribe al cliente como humano: manda directo por `sendWhatsapp` (sin
 * invocar el LLM) y persiste el mensaje en el hilo marcando el autor. Valida,
 * en orden: permiso → agente OFF ("no se pisan") → ventana de 24 h. Recién con
 * el envío confirmado persiste, para no dejar mensajes fantasma. Sólo
 * admin/encargado.
 */
export async function sendStaffMessage(
  businessSlug: string,
  conversationId: string,
  text: string,
): Promise<ActionResult<StaffMessage>> {
  const parsed = SendStaffMessageInput.safeParse({ text });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Mensaje inválido.");
  }
  const cleanText = parsed.data.text;

  const business = await getBusiness(businessSlug);
  if (!business) return actionError("Negocio no encontrado.");

  const ctxResult = await requireMozoActionContext(business.id);
  if (!ctxResult.ok) return ctxResult;
  const ctx = ctxResult.data;
  if (!canManageConversations(ctx.role)) {
    return actionError("No tenés permisos para escribirle al cliente.");
  }

  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const conv = await loadConversationScoped(service, conversationId, business.id);
  if (!conv) return actionError("Conversación no encontrada.");

  // Regla "no se pisan" (defensa server-side; la UI también bloquea la caja):
  // con el agente prendido el bot atiende. El humano la toma apagándolo.
  if (conv.agent_enabled) {
    return actionError(
      "El agente está atendiendo esta conversación. Apagalo para escribirle vos.",
    );
  }

  // Ventana de 24 h: WhatsApp sólo admite texto libre si el cliente escribió
  // hace < 24 h. Se calcula proactivamente; sólo los mensajes del cliente
  // (role:'user') reabren la ventana.
  const { data: msgs } = await service
    .from("chatbot_messages")
    .select("role, created_at")
    .eq("conversation_id", conversationId);
  const inbound = lastInboundAt(
    (msgs ?? []) as { role: string; created_at: string }[],
  );
  if (!isWindowOpen(inbound, Date.now())) {
    return actionError(
      "Se cerró la ventana de 24 h de WhatsApp. No se puede enviar texto libre hasta que el cliente vuelva a escribir.",
    );
  }

  // Destinatario: el identifier del contacto (su número de WhatsApp).
  const { data: contactRow } = await service
    .from("chatbot_contacts")
    .select("identifier")
    .eq("id", conv.contact_id)
    .maybeSingle();
  const identifier = (contactRow as { identifier: string } | null)?.identifier;
  if (!identifier) return actionError("La conversación no tiene un contacto válido.");

  // Nombre del staff para marcar el autor en el hilo (best-effort).
  const { data: profile } = await service
    .from("users")
    .select("full_name")
    .eq("id", ctx.userId)
    .maybeSingle();
  const nombre = (profile as { full_name: string | null } | null)?.full_name ?? null;

  // Envío directo por 360dialog. NO se invoca el LLM: habla el humano.
  const sendRes = await sendWhatsapp({
    businessId: business.id,
    to: identifier,
    text: cleanText,
  });
  if (!sendRes.ok) return actionError(sendRes.error);

  // Persistimos recién con el envío confirmado. role:'assistant' (saliente) +
  // metadata.sent_by='staff' distingue al humano del bot sin tocar el CHECK de
  // `role` (spec 32 · D4). La ausencia de `sent_by` en el historial = bot.
  const nowIso = new Date().toISOString();
  const { error: insErr } = await service.from("chatbot_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: cleanText,
    metadata: { sent_by: "staff", user_id: ctx.userId, nombre },
    created_at: nowIso,
  });
  if (insErr) {
    console.error("sendStaffMessage insert", insErr);
    return actionError(
      "El mensaje se envió pero no se pudo guardar en el historial.",
    );
  }

  // Bump de updated_at para que la conversación suba en la bandeja (igual que
  // el flujo del bot).
  await service
    .from("chatbot_conversations")
    .update({ updated_at: nowIso })
    .eq("id", conversationId);

  revalidatePath(`/${businessSlug}/admin/conversaciones/${conversationId}`);
  revalidatePath(`/${businessSlug}/admin/conversaciones`);
  return actionOk({
    role: "assistant",
    content: cleanText,
    created_at: nowIso,
    sent_by: "staff",
  });
}
