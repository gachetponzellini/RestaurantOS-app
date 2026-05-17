"use server";

import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { pickTableExcluding } from "@/lib/reservations/assign-table";
import {
  getBusinessTables,
  getReservationSettings,
  getReservationsInRange,
} from "@/lib/reservations/queries";
import {
  AdminCreateReservationInputSchema,
  CancelOwnReservationInputSchema,
  CreateReservationInputSchema,
  UpdateReservationStatusInputSchema,
} from "@/lib/reservations/schema";
import type { Reservation } from "@/lib/reservations/types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type GenericClient = SupabaseClient;

const EXCLUSION_VIOLATION = "23P01";
const MAX_ASSIGN_RETRIES = 5;

async function getBusiness(slug: string) {
  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const { data } = await service
    .from("businesses")
    .select("id, timezone")
    .eq("slug", slug)
    .maybeSingle();
  return (data as { id: string; timezone: string } | null) ?? null;
}

async function assertCanManage(businessId: string, userId: string): Promise<boolean> {
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
  const isPlatformAdmin = (profile as { is_platform_admin?: boolean } | null)?.is_platform_admin ?? false;
  const isAdmin = (membership as { role?: string } | null)?.role === "admin";
  const isEncargado = (membership as { role?: string } | null)?.role === "encargado";
  return isPlatformAdmin || isAdmin || isEncargado;
}

type CreateContext = {
  source: "web" | "admin";
  businessId: string;
  timezone: string;
  userId: string | null;
  date: string;
  slot: string;
  partySize: number;
  customerName: string;
  customerPhone: string;
  notes: string | null;
  forcedTableId?: string | null;
  /** Restringe el pool de mesas al salón elegido. Si null, comportamiento
   *  legacy (primer floor_plan del negocio). */
  floorPlanId?: string | null;
};

/**
 * Common booking flow used by both the customer-facing /reservar and the
 * admin "+ Nueva reserva" button. Handles:
 *   - Availability re-check (defends against race after the slot listing).
 *   - Smallest-fit table assignment with retry on 23P01 (exclusion violation).
 *   - Validation against settings (party size, lead time, advance horizon).
 */
async function createReservationCommon(
  ctx: CreateContext,
): Promise<ActionResult<{ id: string }>> {
  const settings = await getReservationSettings(ctx.businessId, { useService: true });

  if (ctx.partySize < 1 || ctx.partySize > settings.max_party_size) {
    return actionError(`El máximo es ${settings.max_party_size} comensales.`);
  }

  const start = fromZonedTime(`${ctx.date}T${ctx.slot}:00`, ctx.timezone);
  if (Number.isNaN(start.getTime())) return actionError("Fecha u hora inválida.");
  const end = new Date(start.getTime() + settings.slot_duration_min * 60_000);

  if (ctx.source === "web") {
    const leadCutoff = new Date(Date.now() + settings.lead_time_min * 60_000);
    if (start < leadCutoff) {
      return actionError("Necesitamos un poco más de antelación para ese horario.");
    }
    const horizonMs = settings.advance_days_max * 24 * 60 * 60 * 1000;
    if (start.getTime() - Date.now() > horizonMs) {
      return actionError(`Solo aceptamos reservas con hasta ${settings.advance_days_max} días de antelación.`);
    }
    const dow = String(new Date(Date.UTC(
      Number(ctx.date.slice(0, 4)),
      Number(ctx.date.slice(5, 7)) - 1,
      Number(ctx.date.slice(8, 10)),
    )).getUTCDay()) as "0" | "1" | "2" | "3" | "4" | "5" | "6";
    const day = settings.schedule[dow];
    if (!day || !day.open || !day.slots.includes(ctx.slot)) {
      return actionError("Ese horario ya no está disponible.");
    }
  }

  const tables = await getBusinessTables(ctx.businessId, {
    useService: true,
    floorPlanId: ctx.floorPlanId ?? null,
  });
  const bufferMs = settings.buffer_min * 60_000;

  // Window we'll lookup overlapping reservations across — slightly wider than
  // the new slot so the buffer comparison sees adjacent reservations.
  const windowStart = new Date(start.getTime() - bufferMs);
  const windowEnd = new Date(end.getTime() + bufferMs);
  const reservations = await getReservationsInRange(
    ctx.businessId,
    windowStart.toISOString(),
    windowEnd.toISOString(),
    { useService: true },
  );

  const service = createSupabaseServiceClient() as unknown as GenericClient;

  const tried = new Set<string>();

  // Admin can pin a specific table. We don't loop in that case — if the
  // exclusion fires we surface the error directly so the operator picks a
  // different table.
  if (ctx.forcedTableId) {
    const target = tables.find((t) => t.id === ctx.forcedTableId);
    if (!target) return actionError("La mesa seleccionada no existe.");
    if (target.status !== "active") return actionError("La mesa está deshabilitada.");
    if (target.seats < ctx.partySize) {
      return actionError(`La mesa "${target.label}" no tiene capacidad para ${ctx.partySize} personas.`);
    }
    const { data, error } = await service
      .from("reservations")
      .insert({
        business_id: ctx.businessId,
        table_id: target.id,
        user_id: ctx.userId,
        customer_name: ctx.customerName,
        customer_phone: ctx.customerPhone,
        party_size: ctx.partySize,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: "confirmed",
        notes: ctx.notes,
        source: ctx.source,
      })
      .select("id")
      .single();
    if (error) {
      if ((error as { code?: string }).code === EXCLUSION_VIOLATION) {
        return actionError("La mesa ya está reservada en ese horario.");
      }
      console.error("createReservation/forced", error);
      return actionError("No pudimos crear la reserva.");
    }
    return actionOk({ id: (data as { id: string }).id });
  }

  for (let attempt = 0; attempt < MAX_ASSIGN_RETRIES; attempt += 1) {
    const candidate = pickTableExcluding(
      {
        tables,
        reservations,
        partySize: ctx.partySize,
        windowStart: start,
        windowEnd: end,
        bufferMs,
      },
      tried,
    );
    if (!candidate) {
      return actionError("Ya no quedan mesas disponibles para ese horario.");
    }

    const { data, error } = await service
      .from("reservations")
      .insert({
        business_id: ctx.businessId,
        table_id: candidate.id,
        user_id: ctx.userId,
        customer_name: ctx.customerName,
        customer_phone: ctx.customerPhone,
        party_size: ctx.partySize,
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        status: "confirmed",
        notes: ctx.notes,
        source: ctx.source,
      })
      .select("id")
      .single();

    if (!error && data) {
      return actionOk({ id: (data as { id: string }).id });
    }

    if ((error as { code?: string } | null)?.code === EXCLUSION_VIOLATION) {
      tried.add(candidate.id);
      // Re-fetch the conflicting reservation list so the next pickTable sees
      // the reservation that beat us. Cheap because the window is small.
      const refreshed = await getReservationsInRange(
        ctx.businessId,
        windowStart.toISOString(),
        windowEnd.toISOString(),
        { useService: true },
      );
      reservations.length = 0;
      reservations.push(...refreshed);
      continue;
    }
    console.error("createReservation/insert", error);
    return actionError("No pudimos crear la reserva.");
  }

  return actionError("No pudimos asignarte una mesa, probá otro horario.");
}

export async function createReservationFromCustomer(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateReservationInputSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return actionError("Necesitás iniciar sesión para reservar.");

  const business = await getBusiness(parsed.data.business_slug);
  if (!business) return actionError("Negocio no encontrado.");

  const result = await createReservationCommon({
    source: "web",
    businessId: business.id,
    timezone: business.timezone,
    userId: user.id,
    date: parsed.data.date,
    slot: parsed.data.slot,
    partySize: parsed.data.party_size,
    customerName: parsed.data.customer_name,
    customerPhone: parsed.data.customer_phone,
    notes: parsed.data.notes,
    floorPlanId: parsed.data.floor_plan_id ?? null,
  });
  if (result.ok) {
    revalidatePath(`/${parsed.data.business_slug}/reservar`);
    revalidatePath(`/${parsed.data.business_slug}/admin/reservas`);
  }
  return result;
}

export async function createReservationFromAdmin(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const parsed = AdminCreateReservationInputSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  }
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return actionError("No autenticado.");

  const business = await getBusiness(parsed.data.business_slug);
  if (!business) return actionError("Negocio no encontrado.");
  if (!(await assertCanManage(business.id, user.id))) {
    return actionError("Permiso denegado.");
  }

  const result = await createReservationCommon({
    source: "admin",
    businessId: business.id,
    timezone: business.timezone,
    userId: null,
    date: parsed.data.date,
    slot: parsed.data.slot,
    partySize: parsed.data.party_size,
    customerName: parsed.data.customer_name,
    customerPhone: parsed.data.customer_phone,
    notes: parsed.data.notes,
    forcedTableId: parsed.data.table_id ?? null,
  });
  if (result.ok) {
    revalidatePath(`/${parsed.data.business_slug}/admin/reservas`);
  }
  return result;
}

export async function updateReservationStatus(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = UpdateReservationStatusInputSchema.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return actionError("No autenticado.");

  const business = await getBusiness(parsed.data.business_slug);
  if (!business) return actionError("Negocio no encontrado.");
  if (!(await assertCanManage(business.id, user.id))) {
    return actionError("Permiso denegado.");
  }

  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const { error } = await service
    .from("reservations")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .eq("business_id", business.id);
  if (error) {
    console.error("updateReservationStatus", error);
    return actionError("No pudimos actualizar el estado.");
  }
  revalidatePath(`/${parsed.data.business_slug}/admin/reservas`);
  return actionOk(null);
}

export async function cancelOwnReservation(
  input: unknown,
): Promise<ActionResult<null>> {
  const parsed = CancelOwnReservationInputSchema.safeParse(input);
  if (!parsed.success) return actionError("Datos inválidos.");
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return actionError("No autenticado.");

  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const { data: reservation } = await service
    .from("reservations")
    .select("id, business_id, user_id, starts_at, status")
    .eq("id", parsed.data.id)
    .maybeSingle();
  const r = reservation as Pick<Reservation, "id" | "business_id" | "user_id" | "starts_at" | "status"> | null;
  if (!r) return actionError("Reserva no encontrada.");
  if (r.user_id !== user.id) return actionError("Permiso denegado.");
  if (r.status === "cancelled" || r.status === "completed" || r.status === "no_show") {
    return actionError("La reserva ya no está activa.");
  }

  const settings = await getReservationSettings(r.business_id, { useService: true });
  const cutoff = new Date(new Date(r.starts_at).getTime() - settings.lead_time_min * 60_000);
  if (Date.now() > cutoff.getTime()) {
    return actionError("Ya pasó la ventana para cancelar online. Avisá al local.");
  }

  const { error } = await service
    .from("reservations")
    .update({ status: "cancelled" })
    .eq("id", r.id)
    .eq("user_id", user.id);
  if (error) return actionError("No pudimos cancelar la reserva.");
  return actionOk(null);
}
