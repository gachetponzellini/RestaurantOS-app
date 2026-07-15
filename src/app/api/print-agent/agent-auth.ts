import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getPrintAgentKey } from "@/lib/print-agent/credentials";

/**
 * Auth compartida del contrato del print agent (spec 28/33/35/046). Bearer con
 * la key del agente. La usan el `GET`/`POST /api/print-agent` y el
 * `POST /api/print-agent/heartbeat`.
 *
 * Acepta DOS keys (spec 046):
 *   1. La `PRINT_AGENT_KEY` global de env (retrocompat — agentes ya desplegados).
 *   2. La key POR NEGOCIO de `print_agent_credentials` (autoinstalador).
 * Una key de negocio no autentica contra otro `business_id`.
 */
export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/** Comparación de tokens en tiempo constante (evita timing attacks). */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function verifyAgentKey(
  req: Request,
  businessId?: string | null,
): Promise<boolean> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const token = auth.slice(7);

  // 1. Key global (retrocompat). Corta antes de tocar la DB.
  const globalKey = process.env.PRINT_AGENT_KEY;
  if (globalKey && safeEqual(token, globalKey)) return true;

  // 2. Key por negocio — requiere saber contra qué negocio se valida.
  if (!businessId) return false;
  const key = await getPrintAgentKey(businessId);
  return !!key && safeEqual(token, key);
}
