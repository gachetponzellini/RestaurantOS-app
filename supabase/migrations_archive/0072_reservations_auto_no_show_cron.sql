-- ============================================
-- Spec 22 — auto-cierre de reservas vencidas (no_show)
-- ============================================
-- Una reserva 'confirmed' que nunca se sienta quedaba 'confirmed' para siempre
-- y ensuciaba la analítica (funnel/tasa de asistencia). Este job la marca
-- 'no_show' pasada la gracia configurada por negocio
-- (`reservation_settings.no_show_grace_min`, default 30 si el negocio no tiene
-- settings). Al dejar de ser estado "vivo", libera la mesa en el exclusion
-- constraint.
--
-- Idempotente (solo toca 'confirmed') y multi-tenant en una pasada. Espejo en
-- TS: `isOverdueConfirmed` en src/lib/reservations/no-show.ts (testeable sin
-- correr el cron).
--
-- On-site: el Postgres del local necesita pg_cron habilitado; si no, se dispara
-- manualmente `select public.mark_overdue_reservations_no_show();`.
-- ============================================

create or replace function public.mark_overdue_reservations_no_show()
returns integer
language sql
security definer
set search_path = public
as $$
  with upd as (
    update public.reservations r
    set status = 'no_show'
    where r.status = 'confirmed'
      and r.starts_at + make_interval(mins => coalesce(
            (select s.no_show_grace_min
               from public.reservation_settings s
              where s.business_id = r.business_id),
            30)) < now()
    returning 1
  )
  select count(*)::int from upd;
$$;

-- Job interno: solo lo invoca el scheduler. Nadie del API lo ejecuta.
revoke all on function public.mark_overdue_reservations_no_show() from public;

-- pg_cron: cada 10 minutos. `cron.schedule(jobname,...)` hace upsert por
-- nombre, así que re-aplicar la migración no duplica el job.
create extension if not exists pg_cron;

select cron.schedule(
  'reservations-no-show',
  '*/10 * * * *',
  $$ select public.mark_overdue_reservations_no_show(); $$
);
