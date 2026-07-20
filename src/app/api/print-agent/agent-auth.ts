import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getPrintAgentKey } from "@/lib/print-agent/credentials";

/**
 * Auth compartida del contrato del print agent (spec 28/33/35/046). Bearer con
 * la key POR NEGOCIO de `print_agent_credentials` (autoinstalador). La usan el
 * `GET`/`POST /api/print-agent` y el `POST /api/print-agent/heartbeat`.
 *
 * Solo keys por-negocio: la `PRINT_AGENT_KEY` global se retiró (security review
 * #4) porque autenticaba contra CUALQUIER `business_id` — quien la tuviera podía
 * leer comandas y sabotear la impresión de todos los negocios. El agente on-site
 * de golf ya migró a su key por-negocio (spec 046), así que el fallback global
 * ya no hace falta. Una key de negocio nunca autentica contra otro `business_id`,
 * y sin `businessId` no se puede validar (→ false).
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

  // Key por negocio — sin saber contra qué negocio validar, no se autentica.
  if (!businessId) return false;
  const key = await getPrintAgentKey(businessId);
  return !!key && safeEqual(token, key);
}
