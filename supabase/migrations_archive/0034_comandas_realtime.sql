-- ============================================
-- Comandas en realtime
-- ============================================
-- Sumar `comandas` a la publication `supabase_realtime` para que la nueva
-- tab "Comandas" en `/admin/local` reciba INSERT/UPDATE en vivo, sin
-- depender del polling 10s que usa la vista del mozo.
--
-- `orders` ya está en la publication desde migración 0002.
-- `notifications` queda fuera todavía (DT-004) — el bell sigue por polling
-- via revalidatePath.

alter publication supabase_realtime add table public.comandas;
