-- ============================================
-- Realtime para `tables` y `notifications`
-- ============================================
-- Cierra DT-004 y DT-011 (wiki/deuda-tecnica.md).
--
-- Hasta ahora:
-- - El plano del salón en /mozo y /admin/local refrescaba por
--   `setInterval(router.refresh, 10_000)` — UX con delay perceptible
--   cuando dos personas operan a la vez.
-- - El bell de notificaciones se refrescaba por revalidatePath post-action
--   y polling — los pings al server eran innecesarios.
--
-- Suscribir estas tablas a `supabase_realtime` permite usar
-- `supabase.channel(...).on('postgres_changes', ...)` desde el client.
--
-- `comandas` ya estaba (0034). `orders` ya estaba (0002).
-- `tables_audit_log` queda fuera por ahora — no hay caso de uso de live
-- audit en UI; se consulta on-demand.
-- ============================================

alter publication supabase_realtime add table public.tables;
alter publication supabase_realtime add table public.notifications;
