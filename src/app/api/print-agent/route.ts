import { NextResponse } from "next/server";

import { notifyPrintFailed } from "@/lib/notifications/events";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

function unauthorized() {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

function verifyAgentKey(req: Request): boolean {
  const expected = process.env.PRINT_AGENT_KEY;
  if (!expected) return false;
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  return auth.slice(7) === expected;
}

/**
 * GET /api/print-agent?business_id=X[&station_id=Y]
 *
 * Devuelve las comandas en estado `pendiente` con su contenido imprimible.
 * Si se pasa `station_id`, filtra por sector; si no, devuelve todas las del
 * negocio. El print agent llama esto en loop (pull).
 */
export async function GET(req: Request) {
  if (!verifyAgentKey(req)) return unauthorized();

  const url = new URL(req.url);
  const businessId = url.searchParams.get("business_id");
  if (!businessId) {
    return NextResponse.json(
      { error: "missing business_id" },
      { status: 400 },
    );
  }

  const service = createSupabaseServiceClient();

  let query = service
    .from("comandas")
    .select(
      `
      id,
      station_id,
      batch,
      status,
      emitted_at,
      stations!inner(name, printer_ip, printer_port, printer_enabled),
      orders!inner(
        id,
        business_id,
        table_id,
        tables!orders_table_id_fkey(label)
      ),
      comanda_items(
        order_item_id,
        order_items!inner(
          id,
          quantity,
          notes,
          unit_price_cents,
          products(name),
          order_item_modifiers(modifiers(name))
        )
      )
    `,
    )
    .eq("status", "pendiente")
    .eq("orders.business_id", businessId)
    .order("emitted_at", { ascending: true });

  const stationId = url.searchParams.get("station_id");
  if (stationId) {
    query = query.eq("station_id", stationId);
  }

  const { data: comandas, error } = await query;
  if (error) {
    console.error("print-agent GET", error);
    return NextResponse.json({ error: "query failed" }, { status: 500 });
  }

  const printable = (comandas ?? []).map((c) => {
    const order = c.orders as unknown as {
      id: string;
      business_id: string;
      table_id: string | null;
      tables: { label: string } | null;
    };
    const station = c.stations as unknown as {
      name: string;
      printer_ip: string | null;
      printer_port: number;
      printer_enabled: boolean;
    };

    return {
      comanda_id: c.id,
      station_id: c.station_id,
      station_name: station?.name ?? "—",
      // Destino de impresión del sector (spec 28). El agente imprime en esta IP
      // sin mapeo local; si es null, saltea la comanda y la deja `pendiente`.
      printer_ip: station?.printer_ip ?? null,
      printer_port: station?.printer_port ?? 9100,
      printer_enabled: station?.printer_enabled ?? true,
      batch: c.batch,
      emitted_at: c.emitted_at,
      table_label: order?.tables?.label ?? "—",
      items: ((c.comanda_items ?? []) as unknown[]).map((ci) => {
        const item = ci as {
          order_item_id: string;
          order_items: {
            id: string;
            quantity: number;
            notes: string | null;
            unit_price_cents: number;
            products: { name: string } | null;
            order_item_modifiers: { modifiers: { name: string } | null }[];
          };
        };
        return {
          product_name: item.order_items?.products?.name ?? "—",
          quantity: item.order_items?.quantity ?? 1,
          notes: item.order_items?.notes ?? null,
          modifiers: (item.order_items?.order_item_modifiers ?? [])
            .map((m) => m.modifiers?.name)
            .filter(Boolean),
        };
      }),
    };
  });

  return NextResponse.json({ comandas: printable });
}

/**
 * POST /api/print-agent
 * Body: { comanda_id: string, result?: "ok" | "failed", error?: string }
 *
 * - `result:"ok"` (default, retrocompatible): el agente imprimió → transiciona
 *   `pendiente → en_preparacion` y limpia un eventual flag de fallo.
 * - `result:"failed"` (spec 33): el agente no pudo imprimir → setea
 *   `print_failed_at` y avisa (notificación `comanda.impresion_fallida`), una sola
 *   vez por comanda (dedup vía `print_failed_at`). La comanda **no** cambia de
 *   estado (sigue `pendiente`, se reintenta).
 */
export async function POST(req: Request) {
  if (!verifyAgentKey(req)) return unauthorized();

  let body: { comanda_id?: string; result?: "ok" | "failed"; error?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const comandaId = body.comanda_id;
  if (!comandaId) {
    return NextResponse.json(
      { error: "missing comanda_id" },
      { status: 400 },
    );
  }
  const result = body.result ?? "ok";

  const service = createSupabaseServiceClient();

  const { data: row } = await service
    .from("comandas")
    .select("id, status, print_failed_at, orders!inner(business_id)")
    .eq("id", comandaId)
    .maybeSingle();

  if (!row) {
    return NextResponse.json(
      { error: "comanda not found" },
      { status: 404 },
    );
  }

  // ── Reporte de fallo de impresión (spec 33) ──
  if (result === "failed") {
    // Dedup: si ya quedó marcada como fallida, no re-notificar en cada reintento.
    if (row.print_failed_at) {
      return NextResponse.json({
        status: row.status,
        notified: false,
        alreadyFlagged: true,
      });
    }
    const businessId = (row.orders as unknown as { business_id: string })
      .business_id;
    await service
      .from("comandas")
      .update({ print_failed_at: new Date().toISOString() })
      .eq("id", comandaId);
    await notifyPrintFailed({ businessId, comandaId });
    return NextResponse.json({ status: row.status, notified: true });
  }

  // ── Confirmación OK: pendiente → en_preparacion + limpia el flag de fallo ──
  if (row.status !== "pendiente") {
    if (row.print_failed_at) {
      await service
        .from("comandas")
        .update({ print_failed_at: null })
        .eq("id", comandaId);
    }
    return NextResponse.json({ status: row.status, changed: false });
  }

  const { error } = await service
    .from("comandas")
    .update({ status: "en_preparacion", print_failed_at: null })
    .eq("id", comandaId);

  if (error) {
    console.error("print-agent confirm", error);
    return NextResponse.json(
      { error: "update failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ status: "en_preparacion", changed: true });
}
