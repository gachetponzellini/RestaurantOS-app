import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

import { routeOrderToCocina } from "./route-to-cocina";
import { SCHEDULED_MARCH_LEAD_MIN } from "./scheduled";

export type MarchDueResult = {
  considered: number;
  marched: number;
  failed: number;
};

/**
 * Marcha los pedidos diferidos que ya entran en ventana: agendados pagados con
 * `scheduled_at - 40min <= now`, todavía sin marchar (status `pending`).
 *
 * Multi-tenant en una pasada (service client, todos los negocios) — el patrón
 * "una función, todos los tenants" del auto-`no_show` (spec 22). A diferencia
 * de aquél (UPDATE puro en SQL), marchar crea comandas con routing por sector
 * (lógica TS), así que la dispara el cron vía un endpoint, no SQL puro
 * (`march-scheduled` route + `pg_cron`/`pg_net`). Reusa `routeOrderToCocina`,
 * que es **idempotente**: si un pedido ya tiene comandas (lo marchó "marchar
 * ahora"), es no-op.
 */
export async function marchDueScheduledOrders(
  now: Date = new Date(),
): Promise<MarchDueResult> {
  const service = createSupabaseServiceClient();

  // Ventana: scheduled_at <= now + lead. El índice parcial
  // (business_id, scheduled_at) where scheduled_at is not null sirve el filtro.
  const cutoff = new Date(
    now.getTime() + SCHEDULED_MARCH_LEAD_MIN * 60_000,
  ).toISOString();

  const { data: due } = await service
    .from("orders")
    .select("id, business_id")
    .not("scheduled_at", "is", null)
    .eq("payment_status", "paid")
    .eq("status", "pending")
    .eq("delivery_type", "pickup")
    .lte("scheduled_at", cutoff);

  const rows = (due ?? []) as { id: string; business_id: string }[];
  let marched = 0;
  let failed = 0;
  for (const o of rows) {
    try {
      const res = await routeOrderToCocina(o.id, o.business_id);
      if (res.ok) marched += 1;
      else failed += 1;
    } catch (e) {
      console.error("marchDueScheduledOrders · routeOrderToCocina", o.id, e);
      failed += 1;
    }
  }

  return { considered: rows.length, marched, failed };
}
