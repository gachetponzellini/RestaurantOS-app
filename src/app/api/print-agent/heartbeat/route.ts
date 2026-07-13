import { NextResponse } from "next/server";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { unauthorized, verifyAgentKey } from "../agent-auth";

/**
 * POST /api/print-agent/heartbeat
 * Body: { business_id: string }
 *
 * Latido del print agent on-site (spec 35). El agente lo llama cada ~15s con la
 * misma `PRINT_AGENT_KEY`. Upsertea `print_agent_status.last_seen_at`; operación
 * deriva "conectada" (now - last_seen < 60s) vs "sin conexión hace X". Desacopla
 * la señal de salud del ritmo del poll del GET.
 */
export async function POST(req: Request) {
  if (!verifyAgentKey(req)) return unauthorized();

  let body: { business_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const businessId = body.business_id;
  if (!businessId) {
    return NextResponse.json({ error: "missing business_id" }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const { error } = await service
    .from("print_agent_status")
    .upsert(
      { business_id: businessId, last_seen_at: new Date().toISOString() },
      { onConflict: "business_id" },
    );

  if (error) {
    console.error("print-agent heartbeat", error);
    return NextResponse.json({ error: "upsert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
