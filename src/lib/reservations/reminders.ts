import "server-only";

import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { notifyReservationReminder } from "@/lib/notifications/reservation-notify";

/**
 * Barrido multi-tenant de recordatorios de reserva (spec 45). Recorre las
 * reservas `confirmed` que arrancan dentro de la ventana de recordatorio y
 * dispara el aviso (best-effort). La idempotencia la garantiza
 * `customer_message_log` (`reservation_reminder`): reintentos o solapes de tick
 * no reenvían. Lo dispara el cron (`pg_cron` → endpoint), patrón de spec 34.
 *
 * `leadHours` = cuánto antes del turno recordar (default 3h). El canal lo
 * resuelve `dispatchCustomerMessage` por negocio: los que están en `whatsapp`
 * no reciben (no hay template de reserva por WhatsApp), sin romper.
 */
export async function sendDueReservationReminders(
  now: Date = new Date(),
  leadHours = 3,
): Promise<{ considered: number; dispatched: number }> {
  const service = createSupabaseServiceClient();
  const windowEnd = new Date(
    now.getTime() + leadHours * 60 * 60 * 1000,
  ).toISOString();

  const { data: rows } = await service
    .from("reservations")
    .select("id")
    .eq("status", "confirmed")
    .gte("starts_at", now.toISOString())
    .lte("starts_at", windowEnd);

  const reservations = (rows ?? []) as Array<{ id: string }>;
  let dispatched = 0;
  for (const r of reservations) {
    try {
      await notifyReservationReminder({ reservationId: r.id });
      dispatched += 1;
    } catch (err) {
      console.error("sendDueReservationReminders", r.id, err);
    }
  }
  return { considered: reservations.length, dispatched };
}
