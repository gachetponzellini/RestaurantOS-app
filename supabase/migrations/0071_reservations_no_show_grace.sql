-- ============================================
-- Spec 22 — gracia de no-show por negocio
-- ============================================
-- Margen (en minutos) tras `starts_at` antes de que el auto-cierre marque una
-- reserva confirmada como no_show. Default 30 → no rompe filas existentes ni
-- requiere backfill. Lo consume la función `mark_overdue_reservations_no_show`
-- (migración 0072) y el predicado puro `isOverdueConfirmed` en la app.
-- ============================================

alter table public.reservation_settings
  add column if not exists no_show_grace_min int not null default 30
    check (no_show_grace_min >= 0);
