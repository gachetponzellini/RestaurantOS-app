import { NextRequest, NextResponse } from "next/server";

import { getStockMovimientos } from "@/lib/stock/queries";

export async function GET(req: NextRequest) {
  const stockItemId = req.nextUrl.searchParams.get("stockItemId");
  if (!stockItemId) {
    return NextResponse.json({ items: [], total: 0 });
  }
  const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10);
  const result = await getStockMovimientos(stockItemId, page);
  return NextResponse.json(result);
}
