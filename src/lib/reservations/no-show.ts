import type { Reservation } from "@/lib/reservations/types";

/**
 * Predicado puro del auto-cierre (spec 22): ¿una reserva quedó vencida sin
 * sentarse? True solo para `confirmed` cuyo `starts_at + gracia` ya pasó.
 *
 * Espejo en TS de la condición de la función SQL
 * `mark_overdue_reservations_no_show()` (pg_cron) — vive acá aparte para poder
 * testearla sin correr el cron. Solo `confirmed` se cierra: `seated` ya está en
 * mesa, y `completed`/`cancelled`/`no_show` son terminales.
 */
export function isOverdueConfirmed(
  reservation: Pick<Reservation, "status" | "starts_at">,
  graceMin: number,
  now: Date,
): boolean {
  if (reservation.status !== "confirmed") return false;
  const cutoff = new Date(new Date(reservation.starts_at).getTime() + graceMin * 60_000);
  return cutoff.getTime() < now.getTime();
}
