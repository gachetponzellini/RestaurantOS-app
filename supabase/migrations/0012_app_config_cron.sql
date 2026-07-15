-- 0012_app_config_cron.sql
-- Spec 45 (US4) — hace funcionable el cron de recordatorio en Supabase.
--
-- Supabase no permite `ALTER DATABASE/ROLE SET app.settings.*` (el rol postgres
-- no es superusuario) → el patrón GUC de los crons (spec 34) queda inutilizable.
-- Movemos la config del cron a una tabla `app_config` service-role-only (mismo
-- patrón que los secretos por negocio) y la función SECURITY DEFINER la lee de
-- ahí. El valor del secreto NO va en la migración: se inserta en runtime.

create table if not exists "public"."app_config" (
  "key" text primary key,
  "value" text,
  "updated_at" timestamp with time zone default now() not null
);

comment on table "public"."app_config" is
  'Config interna leída por funciones SECURITY DEFINER (crons): cron_base_url, cron_secret. Service-role-only (RLS on, sin policies para authenticated). El secreto se inserta en runtime, nunca en una migración. Spec 45.';

alter table "public"."app_config" enable row level security;
-- Sin policies para `authenticated`/`anon`: solo service_role (y el owner via
-- SECURITY DEFINER) acceden. Espejo del criterio de las tablas de secretos.

-- Recordatorio de reserva: leer base_url + secret de app_config en vez del GUC.
create or replace function "public"."send_due_reservation_reminders"()
  returns "void"
  language "plpgsql"
  security definer
  set "search_path" to 'public'
  as $$
declare
  v_base_url text := (select value from public.app_config where key = 'cron_base_url');
  v_secret   text := (select value from public.app_config where key = 'cron_secret');
begin
  if v_base_url is null or v_base_url = ''
     or v_secret is null or v_secret = '' then
    raise notice 'send_due_reservation_reminders: falta config en app_config (cron_base_url/cron_secret); no dispara';
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
