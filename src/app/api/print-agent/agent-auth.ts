import { NextResponse } from "next/server";

/**
 * Auth compartida del contrato del print agent (spec 28/33/35): Bearer con la
 * `PRINT_AGENT_KEY` de env. La usan tanto el `GET`/`POST /api/print-agent`
 * como el `POST /api/print-agent/heartbeat`.
 */
export function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export function verifyAgentKey(req: Request): boolean {
  const expected = process.env.PRINT_AGENT_KEY;
  if (!expected) return false;
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === expected;
}
