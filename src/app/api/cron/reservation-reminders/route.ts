import { NextResponse } from "next/server";

import { sendDueReservationReminders } from "@/lib/reservations/reminders";

// Recordatorio de reserva por el canal del negocio (spec 45). Lo dispara
// `pg_cron` vía `pg_net` cada 15 min (ver migración 0011), o se curl-ea a mano.
// Protegido por `CRON_SECRET` (Bearer). Fail-closed: sin secreto, cerrado.
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await sendDueReservationReminders();
  return NextResponse.json({ ok: true, ...result });
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
