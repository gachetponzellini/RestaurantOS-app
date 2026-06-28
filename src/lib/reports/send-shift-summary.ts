import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";

import { listBusinessMembers } from "@/lib/admin/members-query";
import { sendEmail } from "@/lib/email/send";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { getBusinessSettings, type Business } from "@/lib/tenant";

import { buildShiftSummary } from "./shift-summary";
import { renderShiftSummaryEmail } from "./shift-summary-email";
import { loadShiftSummaryData } from "./shift-summary-loader";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;
const db = () => createSupabaseServiceClient() as unknown as AnyClient;

export type SendShiftSummaryResult =
  | { ok: true; recipients: number; messageId: string | null; skipped?: false }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Resuelve destinatarios: la lista configurada por negocio si existe, si no los
 * `admin` del negocio. Valida formato y dedupe.
 */
async function resolveRecipients(business: Business): Promise<string[]> {
  const settings = getBusinessSettings(business);
  const configured = (settings.closing_summary_recipients ?? [])
    .map((e) => e.trim())
    .filter((e) => EMAIL_RE.test(e));
  if (configured.length > 0) return Array.from(new Set(configured));

  const members = await listBusinessMembers(business.id);
  const admins = members
    .filter((m) => m.role === "admin")
    .map((m) => m.email.trim())
    .filter((e) => EMAIL_RE.test(e));
  return Array.from(new Set(admins));
}

/** Marca de envío del día (anti-doble-envío). `sent_for_date` = día AR. */
function todayKey(business: Business, now: Date): string {
  return formatInTimeZone(now, business.timezone, "yyyy-MM-dd");
}

async function alreadySentToday(
  business: Business,
  now: Date,
): Promise<boolean> {
  const service = db();
  const { data } = await service
    .from("shift_summary_sends")
    .select("business_id")
    .eq("business_id", business.id)
    .eq("sent_for_date", todayKey(business, now))
    .maybeSingle();
  return Boolean(data);
}

async function markSentToday(business: Business, now: Date): Promise<void> {
  const service = db();
  await service
    .from("shift_summary_sends")
    .upsert(
      {
        business_id: business.id,
        sent_for_date: todayKey(business, now),
        sent_at: now.toISOString(),
      },
      { onConflict: "business_id,sent_for_date" },
    );
}

/**
 * Compone y envía el resumen de cierre de un negocio. Best-effort: si no hay
 * destinatarios o el envío falla, devuelve `ok:false`/registra y no rompe.
 *
 * `force` (manual "enviar ahora") ignora el anti-doble-envío y permite reenviar.
 * El automático (cron) saltea si ya se mandó hoy.
 */
export async function sendShiftSummaryForBusiness(
  businessId: string,
  opts: { force?: boolean; now?: Date } = {},
): Promise<SendShiftSummaryResult> {
  const now = opts.now ?? new Date();
  const service = db();

  const { data: bizRow } = await service
    .from("businesses")
    .select("*")
    .eq("id", businessId)
    .maybeSingle();
  if (!bizRow) return { ok: false, error: "Negocio no encontrado." };
  const business = bizRow as Business;

  if (!opts.force && (await alreadySentToday(business, now))) {
    return { ok: true, skipped: true, reason: "ya enviado hoy" };
  }

  const recipients = await resolveRecipients(business);
  if (recipients.length === 0) {
    console.warn("shift-summary: negocio sin destinatarios", businessId);
    return { ok: false, error: "El negocio no tiene destinatarios (admins con email)." };
  }

  const data = await loadShiftSummaryData(businessId, now);
  if (!data) return { ok: false, error: "No se pudo componer el resumen." };

  const summary = buildShiftSummary(data);
  const { subject, html, text } = renderShiftSummaryEmail(summary);

  const result = await sendEmail({
    to: recipients,
    subject,
    html,
    text,
    fromName: business.name,
  });

  if (!result.ok) {
    console.error("shift-summary: fallo de envío", businessId, result.error);
    return { ok: false, error: result.error };
  }

  // Solo marcamos el día tras un envío OK, así un fallo no bloquea el reintento.
  await markSentToday(business, now);
  return { ok: true, recipients: recipients.length, messageId: result.id };
}

/**
 * Recorre los negocios con resumen automático habilitado cuya hora configurada
 * ya pasó hoy (en su timezone) y que no recibieron el mail aún. Lo dispara el
 * cron (`pg_cron` → endpoint). Multi-tenant en una pasada (patrón spec 31).
 */
export async function sendDueShiftSummaries(now: Date = new Date()): Promise<{
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
}> {
  const service = db();
  const { data: rows } = await service
    .from("businesses")
    .select("id, timezone, settings, is_active")
    .eq("is_active", true);

  const businesses = (rows ?? []) as Array<{
    id: string;
    timezone: string;
    settings: Record<string, unknown> | null;
  }>;

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let considered = 0;

  for (const b of businesses) {
    const settings = (b.settings ?? {}) as {
      closing_summary_enabled?: boolean;
      closing_summary_hour?: number;
    };
    if (!settings.closing_summary_enabled) continue;
    const targetHour = settings.closing_summary_hour;
    if (typeof targetHour !== "number") continue;

    const localHour = Number(formatInTimeZone(now, b.timezone, "H"));
    if (localHour < targetHour) continue; // todavía no es la hora

    considered += 1;
    try {
      const r = await sendShiftSummaryForBusiness(b.id, { now });
      if (r.ok && "skipped" in r && r.skipped) skipped += 1;
      else if (r.ok) sent += 1;
      else failed += 1;
    } catch (e) {
      console.error("sendDueShiftSummaries", b.id, e);
      failed += 1;
    }
  }

  return { considered, sent, skipped, failed };
}
