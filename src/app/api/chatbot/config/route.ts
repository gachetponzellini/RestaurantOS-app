import { NextResponse } from "next/server";

import { ensureAdminAccess } from "@/lib/admin/context";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/chatbot/agent";
import {
  isAnthropicKeyConfigured,
  resolveChatbotState,
} from "@/lib/chatbot/config-state";
import { TOOL_METADATA } from "@/lib/chatbot/tools-metadata";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

export const runtime = "nodejs";

const ALL_TOOL_NAMES = new Set(TOOL_METADATA.map((t) => t.name));

export async function GET(req: Request) {
  const url = new URL(req.url);
  const businessSlug = url.searchParams.get("businessSlug");
  if (!businessSlug) {
    return NextResponse.json(
      { error: "businessSlug required" },
      { status: 400 },
    );
  }
  const business = await getBusiness(businessSlug);
  if (!business) {
    return NextResponse.json({ error: "business not found" }, { status: 404 });
  }
  await ensureAdminAccess(business.id, businessSlug);

  const service = createSupabaseServiceClient();
  const { data } = await service
    .from("chatbot_configs")
    .select("system_prompt, enabled_tools, tool_overrides, chatbot_enabled")
    .eq("business_id", business.id)
    .maybeSingle();

  const chatbotEnabled = Boolean(data?.chatbot_enabled);
  // Sólo la PRESENCIA de la key (booleano), nunca el valor.
  const hasApiKey = isAnthropicKeyConfigured();
  const state = resolveChatbotState({ hasApiKey, enabled: chatbotEnabled });

  return NextResponse.json({
    systemPrompt: data?.system_prompt ?? "",
    defaultPrompt: DEFAULT_SYSTEM_PROMPT,
    // null = all enabled. UI treats null as "all checked".
    enabledTools: (data?.enabled_tools as string[] | null) ?? null,
    toolOverrides:
      (data?.tool_overrides as Record<string, { promptSection?: string }> | null) ??
      {},
    // Defaults shipped in code — UI uses these when the override is empty.
    toolDefaults: Object.fromEntries(
      TOOL_METADATA.map((t) => [t.name, { promptSection: t.promptSection }]),
    ),
    // Estado de configuración del bot (sin exponer la key).
    chatbotEnabled,
    hasApiKey,
    chatbotReady: state.ready,
    notReadyReason: state.ready ? null : state.reason,
  });
}

export async function PUT(req: Request) {
  let body: {
    businessSlug?: string;
    systemPrompt?: string;
    enabledTools?: string[] | null;
    toolOverrides?: Record<string, { promptSection?: string }>;
    chatbotEnabled?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { businessSlug, systemPrompt, enabledTools, toolOverrides, chatbotEnabled } =
    body;
  if (!businessSlug) {
    return NextResponse.json(
      { error: "businessSlug required" },
      { status: 400 },
    );
  }
  const business = await getBusiness(businessSlug);
  if (!business) {
    return NextResponse.json({ error: "business not found" }, { status: 404 });
  }
  await ensureAdminAccess(business.id, businessSlug);

  // Build the update payload — only touch fields the caller sent.
  const update: {
    business_id: string;
    updated_at: string;
    system_prompt?: string;
    enabled_tools?: string[] | null;
    tool_overrides?: Record<string, { promptSection?: string }>;
    chatbot_enabled?: boolean;
  } = {
    business_id: business.id,
    updated_at: new Date().toISOString(),
  };
  if (typeof chatbotEnabled === "boolean")
    update.chatbot_enabled = chatbotEnabled;
  if (typeof systemPrompt === "string") update.system_prompt = systemPrompt;
  if (enabledTools !== undefined) {
    if (enabledTools === null) {
      update.enabled_tools = null;
    } else if (Array.isArray(enabledTools)) {
      // Filter out unknown tool names so stale clients can't wedge the config.
      update.enabled_tools = enabledTools.filter((n) => ALL_TOOL_NAMES.has(n));
    } else {
      return NextResponse.json(
        { error: "enabledTools must be array or null" },
        { status: 400 },
      );
    }
  }
  if (toolOverrides !== undefined) {
    if (toolOverrides === null || typeof toolOverrides !== "object") {
      return NextResponse.json(
        { error: "toolOverrides must be an object" },
        { status: 400 },
      );
    }
    // Only keep entries for known tools and with a non-empty promptSection —
    // clearing the textarea in the UI should unset the override, not save "".
    const clean: Record<string, { promptSection?: string }> = {};
    for (const [name, entry] of Object.entries(toolOverrides)) {
      if (!ALL_TOOL_NAMES.has(name)) continue;
      const section = entry?.promptSection;
      if (typeof section === "string" && section.trim().length > 0) {
        clean[name] = { promptSection: section };
      }
    }
    update.tool_overrides = clean;
  }

  const service = createSupabaseServiceClient();
  const { error } = await service.from("chatbot_configs").upsert(update);
  if (error) {
    console.error("chatbot config upsert failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
