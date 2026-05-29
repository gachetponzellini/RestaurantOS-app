import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  FloorTable,
  Reservation,
  ReservationSettings,
} from "@/lib/reservations/types";
import { DEFAULT_RESERVATION_SETTINGS } from "@/lib/reservations/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type GenericClient = SupabaseClient;

/**
 * Reads the reservation settings row, returning DB defaults when nothing was
 * saved yet. The form upserts on save so we never need to insert an empty row
 * up-front, but consumers (the customer-facing reservation flow especially)
 * need defaults to render before the admin has touched anything.
 */
export async function getReservationSettings(
  businessId: string,
  options: { useService?: boolean } = {},
): Promise<ReservationSettings> {
  const supabase = options.useService
    ? (createSupabaseServiceClient() as unknown as GenericClient)
    : ((await createSupabaseServerClient()) as unknown as GenericClient);

  const { data } = await supabase
    .from("reservation_settings")
    .select("*")
    .eq("business_id", businessId)
    .maybeSingle();

  if (data) return data as ReservationSettings;

  return {
    business_id: businessId,
    ...DEFAULT_RESERVATION_SETTINGS,
    updated_at: new Date(0).toISOString(),
  };
}

/**
 * Returns the active+disabled tables of a business.
 *
 * Sin `floorPlanId`: comportamiento legacy — toma el primer floor_plan del
 * negocio (orden por created_at asc). Lo usan admin, mozo y el flujo legacy
 * que asumía un único salón.
 *
 * Con `floorPlanId`: filtra a ese salón específico. Antes de filtrar verifica
 * que el plan pertenezca al `businessId` para no leer mesas cross-tenant si
 * un cliente manda un uuid de otro negocio en el input.
 */
export async function getBusinessTables(
  businessId: string,
  options: { useService?: boolean; floorPlanId?: string | null } = {},
): Promise<FloorTable[]> {
  const supabase = options.useService
    ? (createSupabaseServiceClient() as unknown as GenericClient)
    : ((await createSupabaseServerClient()) as unknown as GenericClient);

  let planId: string | null = null;

  if (options.floorPlanId) {
    const { data: plan } = await supabase
      .from("floor_plans")
      .select("id")
      .eq("id", options.floorPlanId)
      .eq("business_id", businessId)
      .maybeSingle();
    if (!plan) return [];
    planId = (plan as { id: string }).id;
  } else {
    const { data: plan } = await supabase
      .from("floor_plans")
      .select("id")
      .eq("business_id", businessId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!plan) return [];
    planId = (plan as { id: string }).id;
  }

  const { data: tables } = await supabase
    .from("tables")
    .select("*")
    .eq("floor_plan_id", planId);
  return (tables ?? []) as FloorTable[];
}

/**
 * Salones (floor_plans) del negocio que tienen al menos una mesa activa.
 * Usado por el flujo de reservas: si devuelve más de uno, el cliente elige
 * en cuál reservar antes de ver los horarios.
 */
export async function getBusinessSalones(
  businessId: string,
  options: { useService?: boolean } = {},
): Promise<Array<{ id: string; name: string }>> {
  const supabase = options.useService
    ? (createSupabaseServiceClient() as unknown as GenericClient)
    : ((await createSupabaseServerClient()) as unknown as GenericClient);

  const { data: plans } = await supabase
    .from("floor_plans")
    .select("id, name")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  const rows = (plans ?? []) as Array<{ id: string; name: string }>;
  if (rows.length === 0) return [];

  const { data: activeTables } = await supabase
    .from("tables")
    .select("floor_plan_id")
    .in(
      "floor_plan_id",
      rows.map((r) => r.id),
    )
    .eq("status", "active");
  const planIdsWithActive = new Set(
    ((activeTables ?? []) as Array<{ floor_plan_id: string }>).map(
      (t) => t.floor_plan_id,
    ),
  );

  return rows.filter((r) => planIdsWithActive.has(r.id));
}

/**
 * Live (confirmed/seated) reservations whose [starts_at, ends_at) intersects
 * the given window. Used to feed the availability engine.
 */
export async function getReservationsInRange(
  businessId: string,
  fromIso: string,
  toIso: string,
  options: { useService?: boolean } = {},
): Promise<Reservation[]> {
  const supabase = options.useService
    ? (createSupabaseServiceClient() as unknown as GenericClient)
    : ((await createSupabaseServerClient()) as unknown as GenericClient);

  const { data } = await supabase
    .from("reservations")
    .select("*")
    .eq("business_id", businessId)
    .lt("starts_at", toIso)
    .gt("ends_at", fromIso)
    .order("starts_at", { ascending: true });
  return (data ?? []) as Reservation[];
}

