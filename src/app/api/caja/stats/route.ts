import { NextResponse } from "next/server";

import { ensureMozoAccess } from "@/lib/mozo/auth";
import {
  getCajaLiveStats,
  getMovimientosPeriodoActual,
  getPaymentsPeriodoActual,
} from "@/lib/caja/queries";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cajaId = url.searchParams.get("caja");
  if (!cajaId) {
    return NextResponse.json({ error: "missing caja" }, { status: 400 });
  }

  const service = createSupabaseServiceClient();
  const { data: cajaRow } = await service
    .from("cajas")
    .select("id, business_id")
    .eq("id", cajaId)
    .maybeSingle();
  if (!cajaRow) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const businessId = (cajaRow as { business_id: string }).business_id;

  const { data: bizRow } = await service
    .from("businesses")
    .select("slug")
    .eq("id", businessId)
    .single();
  if (!bizRow) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    await ensureMozoAccess(businessId, bizRow.slug as string);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [stats, movimientos, payments] = await Promise.all([
    getCajaLiveStats(cajaId, businessId),
    getMovimientosPeriodoActual(cajaId, businessId),
    getPaymentsPeriodoActual(cajaId, businessId),
  ]);
  return NextResponse.json({ stats, movimientos, payments });
}
