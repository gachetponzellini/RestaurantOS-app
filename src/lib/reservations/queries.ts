import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BusinessRole } from "@/lib/admin/context";

import type {
  FloorTable,
  Reservation,
  ReservationSettings,
} from "@/lib/reservations/types";
import { DEFAULT_RESERVATION_SETTINGS } from "@/lib/reservations/types";
import {
  availabilityLookupWindow,
  computeAvailableSlots,
  type AvailableSlot,
} from "@/lib/reservations/availability";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type GenericClient = SupabaseClient;

/**
 * Resuelve `{ id, timezone }` de un negocio por slug. Helper compartido por
 * booking-actions y availability-actions (antes cada uno tenía su propia copia
 * del select). Usa service client: corre en contextos públicos/anon.
 */
export async function getBusinessBySlug(
  slug: string,
): Promise<{ id: string; timezone: string } | null> {
  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const { data } = await service
    .from("businesses")
    .select("id, timezone")
    .eq("slug", slug)
    .maybeSingle();
  return (data as { id: string; timezone: string } | null) ?? null;
}

/**
 * Resuelve el rol efectivo de un usuario para un negocio + si es platform
 * admin. Reemplaza los `assertCanManage` hechos a mano que vivían en
 * booking-actions / settings-actions: el llamador combina esto con los helpers
 * puros de `lib/permissions/can.ts` (`canManageReservations`,
 * `canConfigureReservations`). Usa service client (corre en contextos públicos
 * donde RLS escondería la membership).
 */
export async function getReservationActor(
  businessId: string,
  userId: string,
): Promise<{ role: BusinessRole | null; isPlatformAdmin: boolean }> {
  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const [{ data: profile }, { data: membership }] = await Promise.all([
    service.from("users").select("is_platform_admin").eq("id", userId).maybeSingle(),
    service
      .from("business_users")
      .select("role")
      .eq("business_id", businessId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  return {
    role: (membership as { role?: BusinessRole } | null)?.role ?? null,
    isPlatformAdmin:
      (profile as { is_platform_admin?: boolean } | null)?.is_platform_admin ?? false,
  };
}

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
  options: {
    useService?: boolean;
    floorPlanId?: string | null;
    excludeBar?: boolean;
  } = {},
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

  let tablesQuery = supabase
    .from("tables")
    .select("*")
    .eq("floor_plan_id", planId);
  // Las mesas de barra (is_bar) quedan fuera del motor de reservas: no se
  // auto-asignan, no se ofrecen ni cuentan para disponibilidad (spec 08).
  if (options.excludeBar) tablesQuery = tablesQuery.eq("is_bar", false);
  const { data: tables } = await tablesQuery;
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

/**
 * Disponibilidad de un negocio para una fecha + party_size, opcionalmente
 * restringida a un salón. Fuente ÚNICA del pipeline "settings + tables +
 * reservas → computeAvailableSlots": la usan el flujo web (`fetchAvailability`)
 * y las tools del chatbot (`checkAvailabilityForChatbot`, `createReservationIntent`).
 *
 * La ventana de reservas es TZ-aware (`availabilityLookupWindow`), así que
 * cubre el día local completo en cualquier offset — antes cada caller la
 * recalculaba a mano (uno en UTC fijo, con bug latente de borde de día).
 *
 * `computeAvailableSlots` (puro) sigue siendo la lógica de negocio; esto solo
 * orquesta la carga de datos.
 */
export async function getAvailability(
  businessId: string,
  timezone: string,
  params: { date: string; partySize: number; floorPlanId?: string | null },
  options: { useService?: boolean } = {},
): Promise<AvailableSlot[]> {
  const settings = await getReservationSettings(businessId, options);
  const tables = await getBusinessTables(businessId, {
    useService: options.useService,
    floorPlanId: params.floorPlanId ?? null,
    excludeBar: true,
  });
  const { fromIso, toIso } = availabilityLookupWindow(params.date, timezone);
  const reservations = await getReservationsInRange(businessId, fromIso, toIso, options);

  return computeAvailableSlots({
    date: params.date,
    partySize: params.partySize,
    settings,
    tables,
    reservations,
    timezone,
  });
}

