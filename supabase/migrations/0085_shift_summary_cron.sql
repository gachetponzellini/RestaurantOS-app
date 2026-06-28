-- ═══════════════════════════════════════════════════════════════════════
-- 0085 — Resumen de cierre por email: anti-doble-envío + cron (spec 34)
--
-- Dos piezas:
--   1. `shift_summary_sends`: registra que el resumen de un negocio ya se mandó
--      por un día (timezone AR). El cron saltea si ya hay marca; el botón
--      "enviar ahora" puede forzar reenvío (no consulta esta tabla).
--   2. `pg_cron` → endpoint `POST /api/cron/send-shift-summary` vía `pg_net`.
--      Mismo patrón que la marcha de diferidos (spec 31, migración 0081): la
--      composición del mail es lógica TS, así que el cron NO arma el mail en SQL
--      — dispara el endpoint, que itera los negocios con hora vencida.
--
-- Config (NO va en la migración → el secreto no se commitea). La función lee:
--   • app.settings.cron_base_url  → ej. 'https://pedidos.com.ar'
--   • app.settings.cron_secret    → mismo valor que el env CRON_SECRET del app
-- (las mismas GUCs que ya usa el cron de diferidos). Sin ellas, no dispara.
-- ═══════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ── 1. Marca de envío del día ────────────────────────────────────────────
create table if not exists public.shift_summary_sends (
  business_id   uuid not null references public.businesses(id) on delete cascade,
  sent_for_date date not null,
  sent_at       timestamptz not null default now(),
  primary key (business_id, sent_for_date)
);

comment on table public.shift_summary_sends is
  'Spec 34: marca anti-doble-envío del resumen de cierre. Una fila por '
  '(negocio, día AR) cuando el mail salió OK. El cron saltea si ya existe; '
  '"enviar ahora" reenvía sin consultar.';

-- Solo el service role la toca (el cron y la server action usan service client).
-- RLS habilitada sin policies → ningún rol anónimo/autenticado lee o escribe.
alter table public.shift_summary_sends enable row level security;

-- ── 2. Disparo por pg_cron ───────────────────────────────────────────────
create or replace function public.send_due_shift_summaries()
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
    raise notice 'send_due_shift_summaries: faltan GUC app.settings.cron_base_url / cron_secret; no se dispara';
    return;
  end if;

  perform net.http_post(
    url     := v_base_url || '/api/cron/send-shift-summary',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body    := '{}'::jsonb
  );
end;
$$;

-- Job interno: solo lo invoca el scheduler.
revoke all on function public.send_due_shift_summaries() from public;

-- pg_cron: cada 15 minutos. La hora exacta de envío la decide cada negocio
-- (closing_summary_hour); el endpoint manda cuando la hora ya pasó y aún no se
-- mandó hoy. `cron.schedule(jobname,...)` hace upsert por nombre.
select cron.schedule(
  'shift-summary-send',
  '*/15 * * * *',
  $$ select public.send_due_shift_summaries(); $$
);
