import { NextRequest, NextResponse } from "next/server";

import { ensureMozoAccess } from "@/lib/mozo/auth";
import { getStockMovimientos } from "@/lib/stock/queries";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function GET(req: NextRequest) {
  const stockItemId = req.nextUrl.searchParams.get("stockItemId");
  if (!stockItemId) {
    return NextResponse.json({ items: [], total: 0 });
  }

  // Resolver el negocio del stock item y exigir acceso con el ROL REAL del
  // usuario (mismo patrón que /api/caja/stats). Antes esta ruta no tenía ningún
  // check: cualquiera —sin sesión— leía el historial de movimientos de stock de
  // cualquier negocio (+ PII del empleado que lo hizo) pasando un stockItemId.
  const service = createSupabaseServiceClient();
  const { data: item } = await service
    .from("stock_items")
    .select("business_id")
    .eq("id", stockItemId)
    .maybeSingle();
  if (!item) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const businessId = (item as { business_id: string }).business_id;

  const { data: biz } = await service
    .from("businesses")
    .select("slug")
    .eq("id", businessId)
    .single();
  if (!biz) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    await ensureMozoAccess(businessId, biz.slug as string);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10);
  const result = await getStockMovimientos(stockItemId, page);
  return NextResponse.json(result);
}
