-- 0017 — Cerrar bypass del CRON_SECRET (hallazgo security review #7)
--
-- Las funciones cron son SECURITY DEFINER y tenían EXECUTE para anon/authenticated.
-- Cada una lee `cron_secret` de `app_config` y hace `net.http_post` al endpoint
-- /api/cron/* con el Bearer válido puesto por ella misma. Al ser anon-ejecutables
-- vía PostgREST RPC, cualquiera con la publishable key podía dispararlas sin
-- conocer CRON_SECRET (forzar reminders/resúmenes por email + marcha anticipada).
--
-- Solo el worker de pg_cron (que corre como owner) las invoca; no necesitan estar
-- expuestas a los roles del cliente. Revocamos EXECUTE a anon y authenticated.
-- Idempotente: `revoke` de un privilegio ausente es no-op.

revoke execute on function public.march_due_scheduled_orders() from anon, authenticated;
revoke execute on function public.send_due_reservation_reminders() from anon, authenticated;
revoke execute on function public.send_due_shift_summaries() from anon, authenticated;
