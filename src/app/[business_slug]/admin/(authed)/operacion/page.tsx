import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { LocalShell } from "@/components/admin/local/local-shell";
import type {
  SalonOrderRef,
  SalonReservationRef,
} from "@/components/admin/local/salon-desktop";
import { ensureAdminAccess } from "@/lib/admin/context";
import { getFloorPlansForBusiness } from "@/lib/admin/floor-plan/queries";
import { getActiveComandas, getStationsForLocal } from "@/lib/admin/local-query";
import { getTodayOrders, startOfTodayUtc } from "@/lib/admin/orders-query";
import {
  getCajasConEstado,
  getCajaUserAssignments,
  getRendicionesPendientesTodosLosMozos,
  getRendicionesHistorial,
} from "@/lib/caja/queries";
import { getMozosByBusiness } from "@/lib/mozo/queries";
import { getCurrentPresent } from "@/lib/rrhh/clock-actions";
import { getTodaySummary } from "@/lib/rrhh/clock-queries";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusiness } from "@/lib/tenant";

export default async function LocalEnVivoPage({
  params,
}: {
  params: Promise<{ business_slug: string }>;
}) {
  const { business_slug } = await params;
  const business = await getBusiness(business_slug);
  if (!business) notFound();

  const ctx = await ensureAdminAccess(business.id, business_slug);
  // Gating: solo encargado / admin / platform admin. Mozo opera desde /mozo.
  if (
    !ctx.isPlatformAdmin &&
    ctx.role !== "admin" &&
    ctx.role !== "encargado"
  ) {
    redirect(`/${business_slug}/mozo`);
  }

  const service = createSupabaseServiceClient() as unknown as SupabaseClient;

  // Ventana "hoy" en la TZ del negocio (no la del server) para que las
  // reservas no se corran en el borde de medianoche (mismo criterio que el
  // board de pedidos via startOfTodayUtc).
  const todayStart = startOfTodayUtc(business.timezone);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const [
    initialOrders,
    initialComandas,
    stations,
    floorPlans,
    { data: dineInOrders },
    { data: reservations },
    mozos,
    cajas,
    rendicionPendientes,
    rendicionHistorial,
    cajaAssignments,
    { data: businessMembersRaw },
    initialPresent,
    todaySummary,
  ] = await Promise.all([
    getTodayOrders(business.id, business.timezone),
    getActiveComandas(business.id, business.timezone),
    getStationsForLocal(business.id),
    getFloorPlansForBusiness(business.id),
    service
      .from("orders")
      .select(
        "id, order_number, table_id, total_cents, created_at, status, customer_name, order_items(product_name, quantity, cancelled_at), comandas(id, batch, status, station_id, emitted_at, delivered_at, stations(name), comanda_items(order_items(product_name, quantity, cancelled_at, products(prep_time_minutes))))",
      )
      .eq("business_id", business.id)
      .eq("delivery_type", "dine_in")
      .eq("lifecycle_status", "open"),
    service
      .from("reservations")
      .select(
        "id, table_id, customer_name, customer_phone, party_size, starts_at, status, notes",
      )
      .eq("business_id", business.id)
      .in("status", ["confirmed", "seated"])
      .gte("starts_at", todayStart.toISOString())
      .lt("starts_at", tomorrowStart.toISOString())
      .order("starts_at", { ascending: true }),
    getMozosByBusiness(business.id),
    getCajasConEstado(business.id),
    getRendicionesPendientesTodosLosMozos(business.id),
    getRendicionesHistorial(business.id),
    getCajaUserAssignments(business.id),
    service
      .from("business_users")
      .select("user_id, full_name")
      .eq("business_id", business.id)
      .is("disabled_at", null),
    getCurrentPresent(business_slug),
    getTodaySummary(business.id),
  ]);

  // /admin/operacion toma full viewport (overlay sobre el sidebar) — sin
  // PageShell/PageHeader: el header con tabs ya vive dentro de LocalShell
  // y el título/subtítulo sumaban ruido a una pantalla densa.
  return (
    <>
      <LocalShell
        slug={business_slug}
        businessId={business.id}
        timezone={business.timezone}
        initialOrders={initialOrders}
        initialComandas={initialComandas}
        stations={stations}
        floorPlans={floorPlans}
        dineInOrders={(dineInOrders ?? []).map((o) => {
          type RawProduct = { prep_time_minutes: number | null };
          type RawOrderItem = {
            product_name: string;
            quantity: number;
            cancelled_at: string | null;
            products: RawProduct | RawProduct[] | null;
          };
          type RawComandaItem = {
            order_items: RawOrderItem | RawOrderItem[] | null;
          };
          type RawComanda = {
            id: string;
            batch: number;
            status: "pendiente" | "en_preparacion" | "entregado";
            station_id: string | null;
            emitted_at: string;
            delivered_at: string | null;
            stations: { name: string } | { name: string }[] | null;
            comanda_items: RawComandaItem[];
          };
          const rawComandas = (o as { comandas?: RawComanda[] }).comandas ?? [];
          return {
            id: o.id as string,
            order_number: o.order_number as number,
            table_id: o.table_id as string | null,
            total_cents: Number(o.total_cents),
            created_at: o.created_at as string,
            status: o.status as string,
            customer_name: (o as { customer_name: string | null }).customer_name,
            items:
              (o as {
                order_items?: Array<{
                  product_name: string;
                  quantity: number;
                  cancelled_at: string | null;
                }>;
              }).order_items ?? [],
            comandas: rawComandas.map((c) => {
              const station = Array.isArray(c.stations)
                ? c.stations[0]
                : c.stations;
              const items = (c.comanda_items ?? [])
                .map((ci) =>
                  Array.isArray(ci.order_items)
                    ? ci.order_items[0]
                    : ci.order_items,
                )
                .filter(
                  (oi): oi is RawOrderItem =>
                    oi != null && oi.cancelled_at === null,
                )
                .map((oi) => {
                  const product = Array.isArray(oi.products)
                    ? oi.products[0]
                    : oi.products;
                  return {
                    product_name: oi.product_name,
                    quantity: oi.quantity,
                    prep_time_minutes: product?.prep_time_minutes ?? null,
                  };
                });
              return {
                id: c.id,
                batch: c.batch,
                status: c.status,
                station_name: station?.name ?? "—",
                emitted_at: c.emitted_at,
                delivered_at: c.delivered_at,
                items,
              };
            }),
          };
        })}
        reservations={(reservations ?? []) as SalonReservationRef[]}
        mozos={mozos}
        currentUserId={ctx.user.id}
        role={ctx.isPlatformAdmin ? "admin" : (ctx.role ?? "admin")}
        cajas={cajas}
        rendicionPendientes={rendicionPendientes}
        rendicionHistorial={rendicionHistorial}
        cajaAssignments={cajaAssignments}
        businessMembers={(businessMembersRaw ?? []) as { user_id: string; full_name: string | null }[]}
        initialPresent={initialPresent}
        todaySummary={todaySummary}
      />
    </>
  );
}

export const dynamic = "force-dynamic";
