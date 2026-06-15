-- ============================================
-- Spec 22 — endurecer grants de las funciones nuevas
-- ============================================
-- Supabase concede EXECUTE por defecto a anon/authenticated sobre funciones
-- nuevas (no alcanza con `revoke from public`). Sin esto:
--   - `mark_overdue_reservations_no_show()` quedaba invocable por cualquier
--     usuario logueado vía /rest/v1/rpc → podría forzar no_show masivos en
--     TODOS los negocios (bypassa RLS, es SECURITY DEFINER). El job lo corre
--     pg_cron como owner, nadie del API debe poder llamarlo.
--   - `is_business_staff(uuid)` quedaba ejecutable por anon. Solo lo necesita
--     `authenticated` (lo invocan las policies RLS de escritura).
-- ============================================

revoke all on function public.mark_overdue_reservations_no_show()
  from anon, authenticated, public;

revoke all on function public.is_business_staff(uuid) from anon, public;
grant execute on function public.is_business_staff(uuid) to authenticated;
