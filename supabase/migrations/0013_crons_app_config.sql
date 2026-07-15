-- 0013_crons_app_config.sql
-- Spec 45 US4 (fast-follow): migrar los otros dos crons pg_net al patrón
-- `app_config` (migración 0012). Antes leían del GUC `app.settings.*`, que
-- Supabase no permite setear (postgres no es superusuario) → nunca disparaban:
-- el mail de cierre (spec 34) y la marcha de pedidos diferidos (spec 31).

create or replace function "public"."send_due_shift_summaries"()
  returns "void" language "plpgsql" security definer set "search_path" to 'public'
  as $$
declare
  v_base_url text := (select value from public.app_config where key = 'cron_base_url');
  v_secret   text := (select value from public.app_config where key = 'cron_secret');
begin
  if v_base_url is null or v_base_url = '' or v_secret is null or v_secret = '' then
    raise notice 'send_due_shift_summaries: falta config en app_config; no dispara';
    return;
  end if;
  perform net.http_post(
    url     := v_base_url || '/api/cron/send-shift-summary',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
end;
$$;

create or replace function "public"."march_due_scheduled_orders"()
  returns "void" language "plpgsql" security definer set "search_path" to 'public'
  as $$
declare
  v_base_url text := (select value from public.app_config where key = 'cron_base_url');
  v_secret   text := (select value from public.app_config where key = 'cron_secret');
begin
  if v_base_url is null or v_base_url = '' or v_secret is null or v_secret = '' then
    raise notice 'march_due_scheduled_orders: falta config en app_config; no dispara';
    return;
  end if;
  perform net.http_post(
    url     := v_base_url || '/api/cron/march-scheduled',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
end;
$$;
