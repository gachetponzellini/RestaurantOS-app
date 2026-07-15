import { NextResponse } from "next/server";

import { notifyPrintFailed } from "@/lib/notifications/events";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { unauthorized, verifyAgentKey } from "./agent-auth";

/**
 * GET /api/print-agent?business_id=X[&station_id=Y]
 *
 * Devuelve las comandas imprimibles: las `pendiente` (recién marchadas) y las
 * que tienen una reimpresión pedida (`reprint_requested_at`, spec 35) aunque ya
 * hayan avanzado de estado. Así el agente vuelve a imprimir un ticket a demanda
 * sin ningún cambio de su lado (imprime lo que el GET trae).
 * Si se pasa `station_id`, filtra por sector; si no, devuelve todas las del
 * negocio. El print agent llama esto en loop (pull).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get("business_id");
  // Auth con el business_id ya parseado (spec 046): acepta key global o del negocio.
  if (!(await verifyAgentKey(req, businessId))) return unauthorized();
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
    // `pendiente` (recién marchada) OR reimpresión pedida (spec 35). Una
    // comanda `en_preparacion`/`entregado` con `reprint_requested_at` seteado
    // vuelve a aparecerle al agente sin cambiar su estado de cocina.
    .or("status.eq.pendiente,reprint_requested_at.not.is.null")
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
 *   `pendiente → en_preparacion` y limpia los flags laterales (fallo +
 *   reimpresión pedida). Si la comanda ya estaba avanzada (reimpresión, spec
 *   35), NO regresa el estado: solo limpia `reprint_requested_at`/`print_failed_at`.
 * - `result:"failed"` (spec 33): el agente no pudo imprimir → setea
 *   `print_failed_at` y avisa (notificación `comanda.impresion_fallida`), una sola
 *   vez por comanda (dedup vía `print_failed_at`). La comanda **no** cambia de
 *   estado (sigue `pendiente`, se reintenta).
 */
export async function POST(req: Request) {
  let body: {
    comanda_id?: string;
    business_id?: string;
    result?: "ok" | "failed";
    error?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Auth con el business_id ya parseado (spec 046): acepta key global o del negocio.
  if (!(await verifyAgentKey(req, body.business_id))) return unauthorized();

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
    .select(
      "id, status, print_failed_at, reprint_requested_at, orders!inner(business_id)",
    )
    .eq("id", comandaId)
    .maybeSingle();

  if (!row) {
    return NextResponse.json(
      { error: "comanda not found" },
      { status: 404 },
    );
  }

  // Ownership por tenant (spec 36): la key del agente es global, así que
  // validamos que la comanda pertenezca al `business_id` que reporta el agente
  // (el mismo que usa en el GET). Sin esto un agente podría transicionar
  // comandas de OTRO negocio. Se exige cuando el agente lo manda; el agente de
  // referencia lo envía siempre.
  const ownerBusinessId = (row.orders as unknown as { business_id: string })
    .business_id;
  if (body.business_id && body.business_id !== ownerBusinessId) {
    return NextResponse.json({ error: "comanda not found" }, { status: 404 });
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
    await service
      .from("comandas")
      .update({ print_failed_at: new Date().toISOString() })
      .eq("id", comandaId);
    await notifyPrintFailed({ businessId: ownerBusinessId, comandaId });
    return NextResponse.json({ status: row.status, notified: true });
  }

  // ── Confirmación OK: pendiente → en_preparacion + limpia flags laterales ──
  // Una comanda ya avanzada (reimpresión, spec 35) se confirma sin regresar el
  // estado: solo se limpian `reprint_requested_at` + `print_failed_at`.
  if (row.status !== "pendiente") {
    if (row.print_failed_at || row.reprint_requested_at) {
      await service
        .from("comandas")
        .update({ print_failed_at: null, reprint_requested_at: null })
        .eq("id", comandaId);
    }
    return NextResponse.json({ status: row.status, changed: false });
  }

  const { error } = await service
    .from("comandas")
    .update({
      status: "en_preparacion",
      print_failed_at: null,
      reprint_requested_at: null,
    })
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
