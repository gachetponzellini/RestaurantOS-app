-- 0011_reservation_reminder_cron.sql
-- Spec 45 (recordatorio de reserva por email — US4).
--
-- Función + cron gemelos de `send_due_shift_summaries` (spec 34): `pg_cron`
-- llama la función cada 15 min, que vía `pg_net` pega al endpoint protegido por
-- CRON_SECRET. El barrido real (qué reservas, qué canal, idempotencia) vive en
-- JS (`sendDueReservationReminders`). Fail-safe: sin los GUC configurados no
-- dispara (mismo patrón que el resto de los crons).

create or replace function "public"."send_due_reservation_reminders"()
  returns "void"
  language "plpgsql"
  security definer
  set "search_path" to 'public'
  as $$
declare
  v_base_url text := current_setting('app.settings.cron_base_url', true);
  v_secret   text := current_setting('app.settings.cron_secret', true);
begin
  if v_base_url is null or v_base_url = ''
     or v_secret is null or v_secret = '' then
    raise notice 'send_due_reservation_reminders: faltan GUC app.settings.cron_base_url / cron_secret; no se dispara';
    return;
  end if;

  perform net.http_post(
    url     := v_base_url || '/api/cron/reservation-reminders',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body    := '{}'::jsonb
  );
end;
$$;

alter function "public"."send_due_reservation_reminders"() owner to "postgres";
revoke all on function "public"."send_due_reservation_reminders"() from public;
grant all on function "public"."send_due_reservation_reminders"() to "service_role";

-- cron.schedule es idempotente por jobname (reaplica sin duplicar). Cada 15 min.
select cron.schedule(
  'reservation-reminders',
  '*/15 * * * *',
  $$ select public.send_due_reservation_reminders(); $$
);
