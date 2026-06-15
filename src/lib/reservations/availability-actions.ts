"use server";

import { actionError, actionOk, type ActionResult } from "@/lib/actions";
import {
  getAvailability,
  getBusinessBySlug,
  getBusinessSalones,
} from "@/lib/reservations/queries";
import {
  AvailabilityQuerySchema,
  ListSalonesQuerySchema,
} from "@/lib/reservations/schema";

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
  const b = await getBusinessBySlug(parsed.data.business_slug);
  if (!b) return actionError("Negocio no encontrado.");

  const slots = await getAvailability(
    b.id,
    b.timezone,
    {
      date: parsed.data.date,
      partySize: parsed.data.party_size,
      floorPlanId: parsed.data.floor_plan_id ?? null,
    },
    { useService: true },
  );

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
  const b = await getBusinessBySlug(parsed.data.business_slug);
  if (!b) return actionError("Negocio no encontrado.");

  const salones = await getBusinessSalones(b.id, { useService: true });
  return actionOk(salones);
}
