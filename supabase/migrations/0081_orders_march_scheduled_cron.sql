-- ============================================
-- Pedidos diferidos — marcha automática (spec 31)
-- ============================================
-- Los agendados (pago aprobado + scheduled_at futuro + sin comandas) tienen que
-- marchar ~40 min antes de la hora de retiro. Decisión del mecanismo (design
-- D5, "a confirmar al implementar"):
--
--   El auto-`no_show` (spec 22, migración 0072) se resuelve con SQL PURO porque
--   es un simple UPDATE de status. La MARCHA, en cambio, crea comandas con
--   routing por sector — lógica de negocio que vive en TS (`routeOrderToCocina`,
--   idempotente, reusada por "marchar ahora"). Replicarla en SQL duplicaría la
--   fuente de verdad del routing. Por eso el cron NO marcha en SQL: dispara el
--   endpoint `POST /api/cron/march-scheduled` vía `pg_net`, y el endpoint corre
--   la lógica TS (`marchDueScheduledOrders`, multi-tenant en una pasada).
--
-- Config (NO va en la migración → el secreto no se commitea). La función lee:
--   • app.settings.cron_base_url  → ej. 'https://pedidos.com.ar'
--   • app.settings.cron_secret    → mismo valor que el env CRON_SECRET del app
-- Se setean una vez con, p.ej.:
--   alter database postgres set app.settings.cron_base_url = 'https://...';
--   alter database postgres set app.settings.cron_secret   = '<secreto>';
-- Sin esas GUCs la función no dispara (raise notice y return) — el botón
-- "marchar ahora" y el curl manual al endpoint son el escape mientras tanto.
--
-- On-site: el Postgres del local necesita pg_cron + pg_net habilitados y poder
-- alcanzar al Next por HTTP (misma LAN). Si no, se dispara el endpoint con un
-- cron del SO.
-- ============================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.march_due_scheduled_orders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_url text := current_setting('app.settings.cron_base_url', true);
  v_secret   text := current_setting('app.settings.cron_secret', true);
begin
  if v_base_url is null or v_base_url = ''
     or v_secret is null or v_secret = '' then
    raise notice 'march_due_scheduled_orders: faltan GUC app.settings.cron_base_url / cron_secret; no se dispara';
    return;
  end if;

  perform net.http_post(
    url     := v_base_url || '/api/cron/march-scheduled',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body    := '{}'::jsonb
  );
end;
$$;

-- Job interno: solo lo invoca el scheduler. Nadie del API lo ejecuta.
revoke all on function public.march_due_scheduled_orders() from public;

-- pg_cron: cada 5 minutos. `cron.schedule(jobname,...)` hace upsert por nombre,
-- así que re-aplicar la migración no duplica el job.
select cron.schedule(
  'orders-march-scheduled',
  '*/5 * * * *',
  $$ select public.march_due_scheduled_orders(); $$
);
