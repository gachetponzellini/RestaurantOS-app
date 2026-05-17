"use server";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import { computeAvailableSlots } from "@/lib/reservations/availability";
import {
  getBusinessSalones,
  getBusinessTables,
  getReservationSettings,
  getReservationsInRange,
} from "@/lib/reservations/queries";
import {
  AvailabilityQuerySchema,
  ListSalonesQuerySchema,
} from "@/lib/reservations/schema";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import type { SupabaseClient } from "@supabase/supabase-js";

type AvailableSlotDTO = {
  slot: string;
  starts_at: string;
  ends_at: string;
};

type SalonDTO = { id: string; name: string };

/**
 * Public-facing action — anonymous users can call this to populate the slot
 * grid before logging in. We use the service client because RLS hides
 * reservations from non-members; reading them is needed to compute who's
 * full but the data leaving here is just a list of "HH:MM" strings, so no
 * customer data leaks.
 */
export async function fetchAvailability(
  input: unknown,
): Promise<ActionResult<AvailableSlotDTO[]>> {
  const parsed = AvailabilityQuerySchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  }
  const service = createSupabaseServiceClient() as unknown as SupabaseClient;
  const { data: business } = await service
    .from("businesses")
    .select("id, timezone")
    .eq("slug", parsed.data.business_slug)
    .maybeSingle();
  const b = business as { id: string; timezone: string } | null;
  if (!b) return actionError("Negocio no encontrado.");

  const settings = await getReservationSettings(b.id, { useService: true });
  const tables = await getBusinessTables(b.id, {
    useService: true,
    floorPlanId: parsed.data.floor_plan_id ?? null,
  });

  // Pull reservations covering the full day (in business timezone) plus one
  // settings.slot_duration so adjacent-day spillovers count.
  const dayStart = new Date(`${parsed.data.date}T00:00:00Z`);
  const dayEnd = new Date(dayStart.getTime() + 36 * 60 * 60 * 1000);
  const reservations = await getReservationsInRange(
    b.id,
    dayStart.toISOString(),
    dayEnd.toISOString(),
    { useService: true },
  );

  const slots = computeAvailableSlots({
    date: parsed.data.date,
    partySize: parsed.data.party_size,
    settings,
    tables,
    reservations,
    timezone: b.timezone,
  });

  return actionOk(
    slots.map((s) => ({
      slot: s.slot,
      starts_at: s.starts_at.toISOString(),
      ends_at: s.ends_at.toISOString(),
    })),
  );
}

/**
 * Public-facing action — anonymous users can call this to know if the
 * business has multiple bookable salones. Returns the ordered list
 * `[{id, name}]`. Only salones with at least one active table are included.
 */
export async function fetchBusinessSalones(
  input: unknown,
): Promise<ActionResult<SalonDTO[]>> {
  const parsed = ListSalonesQuerySchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Datos inválidos.");
  }
  const service = createSupabaseServiceClient() as unknown as SupabaseClient;
  const { data: business } = await service
    .from("businesses")
    .select("id")
    .eq("slug", parsed.data.business_slug)
    .maybeSingle();
  const b = business as { id: string } | null;
  if (!b) return actionError("Negocio no encontrado.");

  const salones = await getBusinessSalones(b.id, { useService: true });
  return actionOk(salones);
}
