-- ============================================
-- DT-001 · orders.cancelled_at
-- ============================================
-- `anularMesa` (lib/mozo/actions.ts) ya escribe a `orders.cancelled_at` para
-- registrar cuándo se anuló una mesa con orden activa, pero la columna nunca
-- se había agregado al schema (cancelled_reason sí existía desde 0001).
-- Sin esta columna Supabase ignora silenciosamente el campo en el update.

alter table public.orders
  add column if not exists cancelled_at timestamptz;

comment on column public.orders.cancelled_at is
  'Timestamp de anulación de la orden (anularMesa). Pareja con cancelled_reason.';
