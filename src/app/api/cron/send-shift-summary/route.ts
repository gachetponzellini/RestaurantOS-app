import { NextResponse } from "next/server";

import { sendDueShiftSummaries } from "@/lib/reports/send-shift-summary";

// Resumen de cierre por email (spec 34). Lo dispara `pg_cron` vía `pg_net` cada
// pocos minutos (ver migración del cron), o se puede curl-ear a mano on-site.
// Protegido por `CRON_SECRET` (Bearer). Fail-closed: sin secreto configurado,
// el endpoint queda cerrado.
//
// `sendDueShiftSummaries` itera los negocios con resumen automático habilitado
// cuya hora ya pasó y que no recibieron el mail hoy (anti-doble-envío), así
// reintentos o solapes de ticks no mandan dos veces.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sendDueShiftSummaries();
  return NextResponse.json({ ok: true, ...result });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
