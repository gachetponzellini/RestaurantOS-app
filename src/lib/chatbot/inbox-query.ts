import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { lastInboundAt } from "./staff-window";

// Queries de la bandeja de conversaciones (spec 32). Acceso por **service
// client**: las tablas `chatbot_*` son service-role-only (RLS on sin policies,
// spec 19/20), así que el cliente con cookie de staff devuelve 0 filas. El
// acceso ya está gateado por `ensureAdminAccess` + scoping explícito por
// `business_id` en cada query. Sin Realtime: la bandeja refresca por polling.

type GenericClient = SupabaseClient;

/** Quién mandó un mensaje saliente: el bot o un humano del staff. */
export type MessageSentBy = "staff" | "bot";

export type InboxMessage = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
  /** Sólo significativo para `assistant`: distingue bot vs humano (spec 32 · D4). */
  sent_by: MessageSentBy;
  /** Nombre del staff que lo escribió (sólo cuando `sent_by === 'staff'`). */
  author_name: string | null;
};

export type InboxConversationDetail = {
  conversation_id: string;
  contact_identifier: string;
  contact_display_name: string | null;
  channel: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  agent_enabled: boolean;
  /** `created_at` del último mensaje del cliente — base de la ventana de 24 h. */
  last_inbound_at: string | null;
  messages: InboxMessage[];
};

export type InboxListItem = {
  conversation_id: string;
  contact_identifier: string;
  contact_display_name: string | null;
  channel: string;
  updated_at: string;
  closed_at: string | null;
  agent_enabled: boolean;
  last_message_preview: string | null;
  last_message_role: "user" | "assistant" | null;
  last_message_sent_by: MessageSentBy | null;
};

const PREVIEW_MAX = 80;

/** Preview de una línea: colapsa saltos y recorta. */
function preview(content: string): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  return oneLine.length > PREVIEW_MAX
    ? oneLine.slice(0, PREVIEW_MAX - 1) + "…"
    : oneLine;
}

/** Deriva el autor de un mensaje desde `metadata`. Ausencia de `sent_by` = bot. */
function sentByOf(metadata: unknown): MessageSentBy {
  const sb = (metadata as { sent_by?: unknown } | null)?.sent_by;
  return sb === "staff" ? "staff" : "bot";
}

/** Nombre del staff guardado en `metadata.nombre`, si lo hay. */
function authorNameOf(metadata: unknown): string | null {
  const n = (metadata as { nombre?: unknown } | null)?.nombre;
  return typeof n === "string" && n.trim() ? n : null;
}

/**
 * Lista las conversaciones del negocio por actividad reciente (`updated_at`
 * desc), con contacto, preview del último mensaje y estado del agente. Cap del
 * piloto: 100 conversaciones. Scopeada por `business_id`.
 */
export async function listConversations(
  businessId: string,
): Promise<InboxListItem[]> {
  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const { data: convsRaw } = await service
    .from("chatbot_conversations")
    .select("id, contact_id, agent_enabled, closed_at, updated_at")
    .eq("business_id", businessId)
    .order("updated_at", { ascending: false })
    .limit(100);

  const convs = (convsRaw ?? []) as Array<{
    id: string;
    contact_id: string;
    agent_enabled: boolean;
    closed_at: string | null;
    updated_at: string;
  }>;
  if (convs.length === 0) return [];

  const contactIds = [...new Set(convs.map((c) => c.contact_id))];
  const convIds = convs.map((c) => c.id);

  const [{ data: contactsRaw }, { data: msgsRaw }] = await Promise.all([
    service
      .from("chatbot_contacts")
      .select("id, identifier, display_name, channel")
      .in("id", contactIds),
    // Todos los mensajes de las conversaciones listadas, más recientes primero;
    // dedup en JS al primero por conversación. Volumen del piloto → aceptable.
    service
      .from("chatbot_messages")
      .select("conversation_id, role, content, metadata, created_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false })
      .limit(2000),
  ]);

  const contactById = new Map(
    ((contactsRaw ?? []) as Array<{
      id: string;
      identifier: string;
      display_name: string | null;
      channel: string;
    }>).map((c) => [c.id, c]),
  );

  const lastByConv = new Map<
    string,
    { role: string; content: string; metadata: unknown }
  >();
  for (const m of (msgsRaw ?? []) as Array<{
    conversation_id: string;
    role: string;
    content: string;
    metadata: unknown;
  }>) {
    if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m);
  }

  return convs.map((c) => {
    const contact = contactById.get(c.contact_id);
    const last = lastByConv.get(c.id);
    const lastRole =
      last?.role === "user" || last?.role === "assistant" ? last.role : null;
    return {
      conversation_id: c.id,
      contact_identifier: contact?.identifier ?? "—",
      contact_display_name: contact?.display_name ?? null,
      channel: contact?.channel ?? "whatsapp",
      updated_at: c.updated_at,
      closed_at: c.closed_at,
      agent_enabled: c.agent_enabled,
      last_message_preview: last ? preview(last.content) : null,
      last_message_role: lastRole,
      last_message_sent_by: last ? sentByOf(last.metadata) : null,
    };
  });
}

/**
 * Detalle de una conversación para la vista de la bandeja: incluye
 * `agent_enabled`, el autor (`sent_by`) por mensaje y `last_inbound_at` (para la
 * ventana de 24 h). Valida que la conversación pertenece al negocio.
 */
export async function getConversationForInbox(
  businessId: string,
  conversationId: string,
): Promise<InboxConversationDetail | null> {
  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const { data: convRaw } = await service
    .from("chatbot_conversations")
    .select("id, business_id, contact_id, agent_enabled, closed_at, created_at, updated_at")
    .eq("id", conversationId)
    .maybeSingle();
  const conv = convRaw as {
    id: string;
    business_id: string;
    contact_id: string;
    agent_enabled: boolean;
    closed_at: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  if (!conv || conv.business_id !== businessId) return null;

  const [{ data: contactRaw }, { data: msgsRaw }] = await Promise.all([
    service
      .from("chatbot_contacts")
      .select("identifier, display_name, channel")
      .eq("id", conv.contact_id)
      .maybeSingle(),
    service
      .from("chatbot_messages")
      .select("role, content, metadata, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }),
  ]);

  const contact = contactRaw as {
    identifier: string;
    display_name: string | null;
    channel: string;
  } | null;

  const messages: InboxMessage[] = ((msgsRaw ?? []) as Array<{
    role: string;
    content: string;
    metadata: unknown;
    created_at: string;
  }>)
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      created_at: m.created_at,
      sent_by: sentByOf(m.metadata),
      author_name: authorNameOf(m.metadata),
    }));

  return {
    conversation_id: conv.id,
    contact_identifier: contact?.identifier ?? "—",
    contact_display_name: contact?.display_name ?? null,
    channel: contact?.channel ?? "whatsapp",
    created_at: conv.created_at,
    updated_at: conv.updated_at,
    closed_at: conv.closed_at,
    agent_enabled: conv.agent_enabled,
    last_inbound_at: lastInboundAt(messages),
    messages,
  };
}
