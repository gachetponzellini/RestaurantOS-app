"use server";

import { formatInTimeZone } from "date-fns-tz";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServiceClient } from "@/lib/supabase/service";

type GenericClient = SupabaseClient;

const DEFAULT_TZ = "America/Argentina/Buenos_Aires";

export type ReservationByToken = {
  businessName: string;
  whenLabel: string;
  partySize: number;
  status: string;
  alreadyConfirmed: boolean;
};

/**
 * Lee una reserva por su `confirm_token` (double opt-in, spec 45). Read-only,
 * sin login: el token opaco es la credencial. Devuelve null si no existe.
 */
export async function getReservationByConfirmToken(
  token: string,
): Promise<ReservationByToken | null> {
  if (!token || token.length < 8) return null;
  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const { data: reservation } = await service
    .from("reservations")
    .select("business_id, party_size, starts_at, status, client_confirmed_at")
    .eq("confirm_token", token)
    .maybeSingle();
  if (!reservation) return null;

  const { data: business } = await service
    .from("businesses")
    .select("name, timezone")
    .eq("id", reservation.business_id)
    .maybeSingle();
  if (!business) return null;

  return {
    businessName: business.name,
    whenLabel: formatInTimeZone(
      new Date(reservation.starts_at),
      business.timezone ?? DEFAULT_TZ,
      "dd/MM 'a las' HH:mm 'hs'",
    ),
    partySize: reservation.party_size,
    status: reservation.status,
    alreadyConfirmed: Boolean(reservation.client_confirmed_at),
  };
}

export type ConfirmAttendanceResult =
  | { ok: true; alreadyConfirmed: boolean }
  | { ok: false; error: string };

/**
 * Marca `client_confirmed_at` para la reserva del token (asistencia confirmada
 * por el cliente). Sólo para reservas activas; idempotente. Mutación por POST
 * (form action), no en el GET de la página, para no confirmar por prefetch.
 */
export async function confirmReservationAttendance(
  token: string,
): Promise<ConfirmAttendanceResult> {
  if (!token || token.length < 8) {
    return { ok: false, error: "Link inválido." };
  }
  const service = createSupabaseServiceClient() as unknown as GenericClient;
  const { data: reservation } = await service
    .from("reservations")
    .select("id, status, client_confirmed_at")
    .eq("confirm_token", token)
    .maybeSingle();
  if (!reservation) return { ok: false, error: "No encontramos la reserva." };

  if (reservation.status !== "confirmed" && reservation.status !== "seated") {
    return { ok: false, error: "Esta reserva ya no está activa." };
  }
  if (reservation.client_confirmed_at) {
    return { ok: true, alreadyConfirmed: true };
  }

  const { error } = await service
    .from("reservations")
    .update({ client_confirmed_at: new Date().toISOString() })
    .eq("id", reservation.id);
  if (error) {
    console.error("confirmReservationAttendance", error);
    return { ok: false, error: "No pudimos confirmar. Probá de nuevo." };
  }
  return { ok: true, alreadyConfirmed: false };
}
