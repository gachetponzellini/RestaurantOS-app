-- ============================================
-- Make log triggers run as definer so they can write to
-- order_status_history regardless of the caller's RLS policies.
-- (The caller's right to update orders is still enforced by the
--  orders RLS policy.)
-- ============================================
alter function public.log_order_status_change() security definer;
alter function public.log_order_initial_status() security definer;
